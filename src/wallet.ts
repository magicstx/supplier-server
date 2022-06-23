import ElectrumClient, { Unspent } from 'electrum-client-sl';
import { getBtcTxUrl, getScriptHash, satsToBtc, shiftInt } from './utils';
import {
  getBtcPayment,
  getBtcNetwork,
  getBtcSigner,
  getElectrumConfig,
  getStxNetwork,
  getStxAddress,
  getContractAddress,
  getOperatorId,
} from './config';
import { payments, Psbt, Transaction } from 'bitcoinjs-lib';
import { logger } from './logger';
import { fetchAccountBalances } from 'micro-stacks/api';
import { bridgeContract, stacksProvider } from './stacks';
import BigNumber from 'bignumber.js';

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

export function txWeight(inputs: number) {
  const baseSize = 2n * 33n + 10n;
  return BigInt(inputs + 1) * 146n + baseSize;
}

export async function selectCoins(amount: bigint, client: ElectrumClient) {
  const { output } = getBtcPayment();
  if (!output) throw new Error('Unable to get output for operator wallet.');

  const scriptHash = getScriptHash(output);
  const unspents = await client.blockchain_scripthash_listunspent(scriptHash.toString('hex'));
  const sorted = unspents.sort((a, b) => (a.value < b.value ? 1 : -1));

  let coinAmount = 0n;
  // TODO: dynamic fee rate
  const feeRate = 2n;
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
    const size = txWeight(i + 1);
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
    fee: feeRate * txWeight(selected.length),
    total: coinAmount,
  };
}

interface SendBtc {
  amount: bigint;
  recipient: string;
  client: ElectrumClient;
}

export async function sendBtc(opts: SendBtc) {
  const { client, ...logOpts } = opts;
  logger.debug({ ...logOpts, topic: 'sendBtc' });
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
  await tryBroadcast(client, final);
  return final;
}

export async function tryBroadcast(client: ElectrumClient, tx: Transaction) {
  const id = tx.getId();
  try {
    await client.blockchain_transaction_broadcast(tx.toHex());
    logger.info(
      {
        topic: 'btcBroadcast',
        txid: id,
        txUrl: getBtcTxUrl(id),
      },
      `Broadcasted BTC tx ${id}`
    );
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

export async function getBtcBalance() {
  return withElectrumClient(async client => {
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
}

export async function getStxBalance() {
  const network = getStxNetwork();
  const stxAddress = getStxAddress();
  const balances = await fetchAccountBalances({
    url: network.getCoreApiUrl(),
    principal: stxAddress,
  });
  const contractAddress = getContractAddress();
  const xbtcId = `${contractAddress}.xbtc::xbtc`;
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
  const supplierId = getOperatorId();
  const funds = await provider.ro(bridge.getFunds(supplierId));
  return {
    xbtc: shiftInt(funds, -8).toNumber(),
  };
}

export async function getBalances() {
  const [stx, btc, xbtc] = await Promise.all([getStxBalance(), getBtcBalance(), getXbtcFunds()]);
  return {
    stx,
    btc,
    xbtc,
  };
}
