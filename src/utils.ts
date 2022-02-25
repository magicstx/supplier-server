import { privateKeyToStxAddress, StacksNetworkVersion } from 'micro-stacks/crypto';
import { hashSha256 } from 'micro-stacks/crypto-sha';

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
