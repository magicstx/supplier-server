import Redis, { Redis as RedisClient } from 'ioredis';
import { getNetworkKey } from './config';
export type { Redis as RedisClient } from 'ioredis';

export enum RedisKeys {
  LastSeenTxid = 'LastSeenTxidV3',
  RedeemedHTLC = 'RedeemedHTLC',
  SentOutbound = 'SentOutbound',
  FinalizedOutbound = 'FinalizedOutbound',
  PendingFinalizedOutbound = 'PendingFinalizedOutbound',
}

export function redisKeyPrefix() {
  const network = getNetworkKey();
  return `swapy-${network}`;
}

export function workerKeyPrefix() {
  const network = getNetworkKey();
  return `supplier-worker-${network}`;
}

export function getRedisUrl() {
  const url = process.env.REDIS_URL || process.env.REDISTOGO_URL;
  if (typeof url === 'undefined') {
    return 'redis://127.0.0.1:6379';
  }
  return url;
}

export function createRedisClient() {
  const url = getRedisUrl();
  const keyPrefix = redisKeyPrefix();
  const client = new Redis(url, { keyPrefix });
  return client;
}

export function createWorkerRedisClient() {
  const url = getRedisUrl();
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
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

// helpers

export async function getAllKeys(client: RedisClient, withPrefix = false): Promise<string[]> {
  const keyPrefix = redisKeyPrefix();
  return new Promise(resolve => {
    const keys: string[] = [];
    const stream = client.scanStream({
      count: 1000,
    });
    stream.on('data', (res: string[]) => {
      if (withPrefix) {
        keys.push(...res);
      } else {
        const fixedKeys = res.map(key => key.slice(keyPrefix.length));
        keys.push(...fixedKeys);
      }
    });
    stream.on('end', () => {
      resolve(keys);
    });
  });
}

export async function getAllKeysAndValues(client: RedisClient, withPrefix = false) {
  const keys = await getAllKeys(client, withPrefix);
  const values = await client.mget(keys);
  const combined: [string, string | null][] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = values[i];
    combined.push([key, value]);
  }
  return combined;
}
