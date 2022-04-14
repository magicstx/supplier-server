import { privateKeyToStxAddress, StacksNetworkVersion } from 'micro-stacks/crypto';
import { hashSha256 } from 'micro-stacks/crypto-sha';
import BigNumber from 'bignumber.js';
import { IntegerType } from 'micro-stacks/common';

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
  return { key, isCompressed: true };
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

export function shiftInt(int: IntegerType, shift: number) {
  return new BigNumber(intToString(int)).shiftedBy(shift);
}
