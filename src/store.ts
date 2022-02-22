import Redis, { Redis as RedisClient } from 'ioredis';
import { getNetworkKey } from './config';
export type { Redis as RedisClient } from 'ioredis';

export enum RedisKeys {
  LastSeenTxid = 'LastSeenTxidV2',
  RedeemedHTLC = 'RedeemedHTLC',
  SentOutbound = 'SentOutbound',
  FinalizedOutbound = 'FinalizedOutbound',
  PendingFinalizedOutbound = 'PendingFinalizedOutbound',
}

export function createRedisClient() {
  const network = getNetworkKey();
  const url = process.env.REDIS_URL || process.env.REDISTOGO_URL;
  const family = process.env.REDIS_FAMILY ? parseInt(process.env.REDIS_FAMILY, 10) : 4;
  const client = new Redis(url, { keyPrefix: `swapy-${network}`, family });
  return client;
}

export async function getLastSeenTxid(client: RedisClient) {
  return client.get(RedisKeys.LastSeenTxid);
}

export async function setLastSeenTxid(client: RedisClient, last: string) {
  return client.set(RedisKeys.LastSeenTxid, last);
}

export function redeemedHTLCKey(txid: string) {
  return `${RedisKeys.RedeemedHTLC}::${txid}`;
}

export async function getRedeemedHTLC(client: RedisClient, txid: string) {
  const key = redeemedHTLCKey(txid);
  return client.get(key);
}

export async function setRedeemedHTLC(client: RedisClient, txid: string, redeemTxid: string) {
  const key = redeemedHTLCKey(txid);
  return client.set(key, redeemTxid);
}

// outbound transactions

export function sentOutboundKey(id: bigint) {
  return `${RedisKeys.SentOutbound}::${id}`;
}

export async function getSentOutbound(client: RedisClient, id: bigint) {
  const key = sentOutboundKey(id);
  return client.get(key);
}

export async function setSentOutbound(client: RedisClient, id: bigint, txid: string) {
  const key = sentOutboundKey(id);
  return client.set(key, txid);
}

export function pendingFinalizedOutboundKey(id: bigint, txid: string) {
  return `${id}::${txid}`;
}

export async function setPendingFinalizedOutbound(client: RedisClient, id: bigint, txid: string) {
  const key = pendingFinalizedOutboundKey(id, txid);
  await client.sadd(RedisKeys.PendingFinalizedOutbound, key);
}

export async function getAllPendingFinalizedOutbound(client: RedisClient) {
  return client.smembers(RedisKeys.PendingFinalizedOutbound);
}

export async function removePendingFinalizedOutbound(
  client: RedisClient,
  id: bigint,
  txid: string
) {
  const key = pendingFinalizedOutboundKey(id, txid);
  return client.srem(RedisKeys.PendingFinalizedOutbound, key);
}

export function finalizedOutboundKey(id: bigint) {
  return `${RedisKeys.FinalizedOutbound}::${id}`;
}

export async function getFinalizedOutbound(client: RedisClient, id: bigint) {
  const key = finalizedOutboundKey(id);
  return client.get(key);
}

export async function setFinalizedOutbound(client: RedisClient, id: bigint, finalizeTxid: string) {
  const key = finalizedOutboundKey(id);
  return client.set(key, finalizeTxid);
}

export async function removeAll(client: RedisClient) {
  await client.flushall();
}
