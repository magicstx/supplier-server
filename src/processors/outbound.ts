import { Transaction } from '@stacks/stacks-blockchain-api-types';
import { networks, payments } from 'bitcoinjs-lib';
import { deserializeCV, ResponseOkCV, UIntCV } from 'micro-stacks/clarity';
import { bytesToBigInt, hexToBigInt } from 'micro-stacks/common';
import { getBtcNetwork } from '../config';
import {
  getSentOutbound,
  setSentOutbound,
  RedisClient,
  setPendingFinalizedOutbound,
} from '../store';
import { logger } from '../logger';
import { sendBtc, withElectrumClient } from '../wallet';
import { bridgeContract, stacksProvider } from '../stacks';

export async function processOutboundSwap(tx: Transaction, redis: RedisClient) {
  if (tx.tx_type !== 'contract_call') return;
  if (tx.contract_call.function_name !== 'initiate-outbound-swap') return;
  if (!tx.contract_call.function_args) return;
  if (tx.tx_status !== 'success') return;
  const result = deserializeCV<ResponseOkCV<UIntCV>>(tx.tx_result.hex);
  const swapId = result.value.value;
  const sent = await getSentOutbound(redis, swapId);
  if (sent) {
    logger.info(`Already sent outbound swap ${swapId} in ${sent}.`);
    return;
  }
  const sentTxid = await sendOutbound(swapId);
  await setSentOutbound(redis, swapId, sentTxid);
  await setPendingFinalizedOutbound(redis, swapId, sentTxid);
  logger.debug(`Sent outbound in txid ${sentTxid}`);
}

export function getOutboundPayment(hash: Uint8Array, versionBytes: Uint8Array) {
  const version = Number(bytesToBigInt(versionBytes));
  const network = getBtcNetwork();
  if (version === networks.bitcoin.pubKeyHash) {
    return payments.p2pkh({ network, hash: Buffer.from(hash) });
  } else {
    return payments.p2sh({ network, hash: Buffer.from(hash) });
  }
}

export async function sendOutbound(swapId: bigint) {
  const bridge = bridgeContract();
  const provider = stacksProvider();
  const swap = await provider.ro(bridge.getOutboundSwap(swapId));
  if (!swap) throw new Error(`Expected outbound swap ${swapId} to exist.`);
  const { address } = getOutboundPayment(swap.hash, swap.version);
  if (!address) throw new Error(`Unable to get outbound address for swap ${swapId}`);
  const amount = swap.sats;
  logger.debug(`Sending ${amount} sats to ${address}`);
  const txid = await withElectrumClient(async client => {
    const tx = await sendBtc({
      client,
      recipient: address,
      amount,
    });
    const txid = tx.getId();
    return txid;
  });

  return txid;
}
