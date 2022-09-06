import { privateKeyToStxAddress, StacksNetworkVersion } from 'micro-stacks/crypto';
import { hashSha256 } from 'micro-stacks/crypto-sha';
import BigNumber from 'bignumber.js';
import { bytesToHex, IntegerType } from 'micro-stacks/common';
import { getNetworkKey, getStxNetwork } from './config';

export function reverseBuffer(buffer: Buffer): Buffer {
  if (buffer.length < 1) return buffer;
  let j = buffer.length - 1;
  let tmp = 0;
  for (let i = 0; i < buffer.length / 2; i++) {
    tmp = buffer[i];
    buffer[i] = buffer[j];
    buffer[j] = tmp;
    j--;
  }
  return buffer;
}

export function getScriptHash(output: Buffer): Buffer {
  const uintOutput = Uint8Array.from(output);
  const hash = hashSha256(uintOutput);
  const reversed = reverseBuffer(Buffer.from(hash));
  return reversed;
}

export function getCompressedKey(key: string) {
  if (key.length === 66) {
    const compressed = key.slice(64);
    return {
      key: key.slice(0, 64),
      isCompressed: compressed === '01',
    };
  }
  return { key, isCompressed: false };
}

export function makeStxAddress(privateKey: string, networkVersion: StacksNetworkVersion): string {
  const { key, isCompressed } = getCompressedKey(privateKey);
  return privateKeyToStxAddress(key, networkVersion, isCompressed);
}

export function intToString(int: IntegerType) {
  const str = typeof int === 'bigint' ? int.toString() : String(int);
  return str;
}

export function bpsToPercent(bps: IntegerType) {
  return new BigNumber(intToString(bps)).dividedBy(100).toString();
}

export function satsToBtc(sats: IntegerType, minDecimals?: number) {
  const n = new BigNumber(intToString(sats)).shiftedBy(-8).decimalPlaces(8);
  if (typeof minDecimals === 'undefined') return n.toFormat();
  const rounded = n.toFormat(minDecimals);
  const normal = n.toFormat();
  return rounded.length > normal.length ? rounded : normal;
}

export function btcToSats(btc: IntegerType) {
  return new BigNumber(intToString(btc)).shiftedBy(8).decimalPlaces(0).toString();
}

export function shiftInt(int: IntegerType, shift: number) {
  return new BigNumber(intToString(int)).shiftedBy(shift);
}

export function stxToUstx(stx: IntegerType) {
  return shiftInt(stx, 6).decimalPlaces(0);
}

export function ustxToStx(ustx: IntegerType) {
  return shiftInt(ustx, -6).decimalPlaces(6);
}

// Add 0x to beginning of txid
export function getTxId(txId: string) {
  return txId.startsWith('0x') ? txId : `0x${txId}`;
}

export function getTxUrl(txId: string) {
  const coreUrl = getStxNetwork().getCoreApiUrl();
  const id = getTxId(txId);
  if (coreUrl.includes('http://localhost')) {
    return `http://localhost:8000/txid/${id}`;
  }
  const network = coreUrl.includes('testnet') ? 'testnet' : 'mainnet';
  return `https://explorer.stacks.co/txid/${id}?chain=${network}`;
}

export function getBtcTxUrl(txId: string) {
  const network = getNetworkKey();
  if (network === 'mocknet') {
    return `http://localhost:8001/tx/${txId}`;
  }
  const base = `https://mempool.space/`;
  return `${base}${network === 'mainnet' ? '' : 'testnet/'}tx/${txId}`;
}

// Returns true if txId === 0x00
export function isRevokedTxid(txId: string | Uint8Array) {
  const txidString = typeof txId === 'string' ? txId : bytesToHex(txId);
  return txidString === '00';
}
