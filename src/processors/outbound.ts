import { networks, payments } from 'bitcoinjs-lib';
import { bytesToBigInt } from 'micro-stacks/common';
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
import { Event, InitiateOutboundPrint, isInitiateOutboundPrint } from '../events';

const logger = _logger.child({ topic: 'sendOutbound' });

export async function processOutboundSwap(event: Event, redis: RedisClient) {
  const { print } = event;
  if (!isInitiateOutboundPrint(print)) return;
  const swapId = print['swap-id'];
  const swapIdNum = Number(swapId);
  if (print.supplier !== BigInt(getSupplierId())) return;
  const sent = await getSentOutbound(redis, swapId);
  if (sent) {
    logger.info(`Already sent outbound swap ${swapId} in ${sent}.`);
    return {
      swapId: swapIdNum,
      skipped: true,
    };
  }
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
  const swapId = event['swap-id'];
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
    });
    const txid = tx.getId();
    return txid;
  });

  return txid;
}
