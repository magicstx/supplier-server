import { networks, payments } from 'bitcoinjs-lib';
import { bytesToBigInt, bytesToHex } from 'micro-stacks/common';
import { getBtcNetwork, getSupplierId } from '../config';
import {
  getSentOutbound,
  setSentOutbound,
  RedisClient,
  setPendingFinalizedOutbound,
} from '../store';
import { logger as _logger } from '../logger';
import { sendBtc, withElectrumClient } from '../wallet';
import { getBtcTxUrl } from '../utils';
import { Event, InitiateOutboundPrint, isInitiateOutboundEvent } from '../events';
import { getOutboundFinalizedTxid } from '../stacks';
import { fetchCoreInfo } from '../stacks-api';

const logger = _logger.child({ topic: 'sendOutbound' });

export async function shouldSendOutbound(event: Event<InitiateOutboundPrint>, redis: RedisClient) {
  const { print } = event;
  if (print.supplier !== BigInt(getSupplierId())) return false;
  const swapId = print.swapId;
  const cached = await getSentOutbound(redis, swapId);
  const finalized = await getOutboundFinalizedTxid(swapId);
  const txid = cached || finalized;
  if (txid) {
    logger.info(`Already sent outbound swap ${swapId} in ${txid}.`);
    return false;
  }
  const currentBlock = (await fetchCoreInfo()).burn_block_height;
  // is it about to expire?
  if (currentBlock - Number(print.createdAt) >= 190) {
    logger.error('Outbound swap expired - not sending');
    return false;
  }
  return true;
}

export async function processOutboundSwap(event: Event, redis: RedisClient) {
  if (!isInitiateOutboundEvent(event)) return false;
  if (!(await shouldSendOutbound(event, redis))) {
    return { skipped: true, swapId: Number(event.print.swapId) };
  }
  const { print } = event;
  const swapId = print.swapId;
  const swapIdNum = Number(swapId);
  const sentTxid = await sendOutbound(print);
  await setSentOutbound(redis, swapId, sentTxid);
  await setPendingFinalizedOutbound(redis, swapId, sentTxid);
  logger.info(
    { swapId: swapIdNum, txid: sentTxid, txUrl: getBtcTxUrl(sentTxid) },
    `Sent outbound in txid ${sentTxid}`
  );
  return {
    swapId: swapIdNum,
    txUrl: getBtcTxUrl(sentTxid),
    sentTxid,
  };
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

export async function sendOutbound(event: InitiateOutboundPrint) {
  const swapId = event.swapId;
  const { address } = getOutboundPayment(event.hash, event.version);
  if (!address) throw new Error(`Unable to get outbound address for swap ${swapId}`);
  const amount = event.sats;
  logger.debug(
    { topic: 'sendOutbound', swapId: Number(swapId), recipient: address },
    `Sending ${amount} sats to ${address}`
  );
  const txid = await withElectrumClient(async client => {
    const tx = await sendBtc({
      client,
      recipient: address,
      amount,
      maxSize: 1024,
    });
    const txid = tx.getId();
    return txid;
  });

  return txid;
}
