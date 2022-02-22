import ElectrumClient, { Unspent } from 'electrum-client-sl';
import { getScriptHash } from './utils';
import { getBtcPayment, getBtcNetwork, getBtcSigner, getElectrumConfig } from './config';
import { payments, Psbt, Transaction } from 'bitcoinjs-lib';
import { logger } from './logger';

export const electrumClient = () => {
  const envConfig = getElectrumConfig();
  const electrumConfig = {
    ...envConfig,
  };
  console.log('electrumConfig', electrumConfig);
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
  logger.trace({ ...opts, topic: 'sendBtc' });
  const { coins, fee, total } = await selectCoins(opts.amount, opts.client);
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
  await tryBroadcast(opts.client, final);
  return final;
}

export async function tryBroadcast(client: ElectrumClient, tx: Transaction) {
  try {
    await client.blockchain_transaction_broadcast(tx.toHex());
  } catch (error) {
    const id = tx.getId();
    logger.error(`Error broadcasting: ${id}`);
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
    logger.error(error);
    await client.close();
    throw error;
  }
}
