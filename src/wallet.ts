import ElectrumClient, { Unspent } from 'electrum-client-sl';
import { btcToSats, getBtcTxUrl, getScriptHash, satsToBtc, shiftInt } from './utils';
import {
  getBtcPayment,
  getBtcNetwork,
  getBtcSigner,
  getElectrumConfig,
  getStxNetwork,
  getStxAddress,
  getSupplierId,
} from './config';
import { payments, Psbt, Transaction } from 'bitcoinjs-lib';
import { logger } from './logger';
import { fetchAccountBalances } from 'micro-stacks/api';
import { bridgeContract, stacksProvider, xbtcAssetId } from './stacks';
import BigNumber from 'bignumber.js';
import { bytesToHex, hexToBytes } from 'micro-stacks/common';

export const electrumClient = () => {
  const envConfig = getElectrumConfig();
  const electrumConfig = {
    ...envConfig,
  };
  return new ElectrumClient(electrumConfig.host, electrumConfig.port, electrumConfig.protocol);
};

export async function withElectrumClient<T = void>(
  cb: (client: ElectrumClient) => Promise<T>
): Promise<T> {
  const client = electrumClient();
  await client.connect();
  try {
    const res = await cb(client);
    await client.close();
    return res;
  } catch (error) {
    console.error(`Error from withElectrumConfig`, error);
    await client.close();
    throw error;
  }
}

// Get the vB size of a BTC transaction.
// Calculations assume p2pkh inputs
export function txWeight(inputs: number, outputs: number) {
  const overhead = 10n;
  const outputSize = 34n * BigInt(outputs);
  const inputSize = 148n * BigInt(inputs);
  return overhead + outputSize + inputSize;
}

export async function listUnspent(client: ElectrumClient) {
  const { output } = getBtcPayment();
  if (!output) throw new Error('Unable to get output for operator wallet.');

  const scriptHash = getScriptHash(output);
  const unspents = await client.blockchain_scripthash_listunspent(scriptHash.toString('hex'));
  return unspents;
}

export async function selectCoins(amount: bigint, client: ElectrumClient) {
  const unspents = await listUnspent(client);
  const sorted = unspents.sort((a, b) => (a.value < b.value ? 1 : -1));

  let coinAmount = 0n;
  const feeRate = BigInt(await getFeeRate(client));
  const selected: (Unspent & { hex: Buffer })[] = [];
  let filled = false;
  for (let i = 0; i < sorted.length; i++) {
    const utxo = sorted[i];
    const txHex = await client.blockchain_transaction_get(utxo.tx_hash);
    selected.push({
      ...utxo,
      hex: Buffer.from(txHex, 'hex'),
    });
    coinAmount += BigInt(utxo.value);
    const size = txWeight(selected.length, 2);
    const fee = feeRate * size;
    if (coinAmount > amount + fee + 5500n) {
      filled = true;
      break;
    }
  }

  if (!filled) {
    throw new Error(`Unable to select enough UTXOs.`);
  }

  return {
    coins: selected,
    fee: feeRate * txWeight(selected.length, 2),
    total: coinAmount,
  };
}

interface SendBtc {
  amount: bigint;
  recipient: string;
  client: ElectrumClient;
  maxSize?: number;
}

export async function sendBtc(opts: SendBtc) {
  const { client, ...logOpts } = opts;
  const { coins, fee, total } = await selectCoins(opts.amount, client);
  const network = getBtcNetwork();

  const psbt = new Psbt({ network });
  const { output, address } = getBtcPayment();
  const signer = getBtcSigner();
  if (!output || !address) throw new Error('Unable to get redeem script of wallet.');
  psbt.addInputs(
    coins.map(coin => {
      return {
        hash: coin.tx_hash,
        index: coin.tx_pos,
        // redeemScript: output,
        nonWitnessUtxo: coin.hex,
      };
    })
  );

  const change = total - opts.amount - fee;
  psbt.addOutput({
    address: opts.recipient,
    value: Number(opts.amount),
  });
  psbt.addOutput({
    address,
    value: Number(change),
  });

  await psbt.signAllInputsAsync(signer);

  psbt.finalizeAllInputs();

  const final = psbt.extractTransaction();
  const hex = hexToBytes(final.toHex());
  if (typeof opts.maxSize !== 'undefined' && hex.length > opts.maxSize) {
    logger.error(
      {
        topic: 'btcTxSize',
        maxSize: opts.maxSize,
        txSize: hex.length,
      },
      `Unable to send BTC - tx of size ${hex.length} bytes is over ${opts.maxSize} bytes`
    );
    throw new Error(
      `Unable to send BTC - tx of size ${hex.length} bytes is over ${opts.maxSize} bytes`
    );
  }
  const txid = await tryBroadcast(client, final);
  if (txid) {
    logger.debug({ ...logOpts, txid, txUrl: getBtcTxUrl(txid), topic: 'sendBtc' });
  }
  return final;
}

export async function tryBroadcast(client: ElectrumClient, tx: Transaction) {
  const id = tx.getId();
  try {
    await client.blockchain_transaction_broadcast(tx.toHex());
    const amount = tx.outs[0].value;
    logger.info(
      {
        topic: 'btcBroadcast',
        txid: id,
        txUrl: getBtcTxUrl(id),
        amount,
      },
      `Broadcasted BTC tx ${id}`
    );
    return id;
  } catch (error) {
    logger.error({ broadcastError: error, txId: id }, `Error broadcasting: ${id}`);
    if (typeof error === 'string' && !error.includes('Transaction already in block chain')) {
      if (error.includes('Transaction already in block chain')) {
        logger.debug(`Already broadcasted redeem in ${id}`);
        return;
      }
      if (error.includes('inputs-missingorspent')) {
        logger.debug(`Already broadcasted redeem in ${id}`);
        return;
      }
    }
    await client.close();
    throw error;
  }
}

// Get Bitcoin fee rate from Electrum's "estimatefee" method.
// Returns sats/vB fee rate for targeting 1-block confirmation
export async function getFeeRate(client: ElectrumClient) {
  const btcPerKb = await client.blockchainEstimatefee(1);
  if (btcPerKb === -1) {
    logger.error('Unable to get fee rate from Electrum.');
    return 1;
  }
  const satsPerKb = btcToSats(btcPerKb);
  const satsPerByte = new BigNumber(satsPerKb).dividedBy(1024).toNumber();
  return Math.ceil(satsPerByte);
}

export async function getBtcBalance() {
  const balances = await withElectrumClient(async client => {
    const { output } = getBtcPayment();
    if (!output) throw new Error('Unable to get output for operator wallet.');

    const scriptHash = getScriptHash(output);
    const balance = await client.blockchain_scripthash_getBalance(scriptHash.toString('hex'));
    const { confirmed, unconfirmed } = balance;
    const total = confirmed + unconfirmed;
    const btc = shiftInt(total, -8).toNumber();
    return {
      confirmed,
      total,
      unconfirmed,
      btc,
    };
  });
  return balances;
}

export async function getStxBalance() {
  const network = getStxNetwork();
  const stxAddress = getStxAddress();
  const balances = await fetchAccountBalances({
    url: network.getCoreApiUrl(),
    principal: stxAddress,
  });
  const xbtcId = xbtcAssetId();
  const stxBalance = shiftInt(balances.stx.balance, -6);
  const xbtcSats = balances.fungible_tokens[xbtcId]?.balance || '0';
  return {
    stx: stxBalance.decimalPlaces(6).toNumber(),
    xbtc: shiftInt(xbtcSats, -8).toNumber(),
    xbtcSats,
  };
}

export async function getXbtcFunds() {
  const bridge = bridgeContract();
  const provider = stacksProvider();
  try {
    const supplierId = getSupplierId();
    const funds = await provider.ro(bridge.getFunds(supplierId));
    return {
      xbtc: shiftInt(funds, -8).toNumber(),
    };
  } catch (error) {
    return {
      xbtc: 0,
    };
  }
}

export async function getBalances() {
  const [stx, btc, xbtc] = await Promise.all([getStxBalance(), getBtcBalance(), getXbtcFunds()]);
  return {
    stx,
    btc,
    xbtc,
  };
}
