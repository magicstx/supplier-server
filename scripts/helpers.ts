import 'cross-fetch/polyfill';
import { ContractCallTyped, TypedAbiArg } from '@clarigen/core';
import BigNumber from 'bignumber.js';
import { prompt } from 'inquirer';
import { AnchorMode, ContractCallOptions, makeContractCall } from 'micro-stacks/transactions';
import { stacksProvider } from '../src/stacks';
import { getTxUrl, stxToUstx, ustxToStx } from '../src/utils';
import { getStxBalance } from '../src/wallet';
import { getStxNetwork, getStxPrivateKey } from '../src/config';
import { bytesToHex, hexToBytes, IntegerType } from 'micro-stacks/common';
import { Prints, Event } from '../src/events';

type UnknownTx = ContractCallTyped<TypedAbiArg<unknown, string>[], unknown>;

export async function broadcastAndLog(tx: UnknownTx, options: Partial<ContractCallOptions>) {
  const provider = stacksProvider();
  const fee = await askFeeOrDefault(tx, options);
  const { txId } = await provider.tx(tx, {
    fee,
    ...options,
  });
  console.log(`Broadcasted: ${getTxUrl(txId)}`);
}

export async function askFeeOrDefault(tx: UnknownTx, options: Partial<ContractCallOptions>) {
  if (typeof options.fee !== 'undefined') return options.fee;
  const estimate = await getFeeEstimate(tx, options);
  const { ustxFee } = await askStxFee(undefined, estimate);
  return ustxFee;
}

export async function askStxFee(_max?: number | string, defaultFee?: IntegerType) {
  let max = _max;
  if (typeof max === 'undefined') {
    max = (await getStxBalance()).stx;
  }
  const defaultStx = typeof defaultFee !== 'undefined' ? ustxToStx(defaultFee) : undefined;
  const { stxFee } = await prompt<{ stxFee: number }>([
    {
      name: 'stxFee',
      message: `How many STX to spend on the network fee for this transaction (in STX)? Max: ${max} STX`,
      type: 'number',
      default: defaultStx,
    },
  ]);
  if (new BigNumber(max).lt(stxFee)) {
    throw new Error(`Invalid fee (${stxFee}). Max: ${max}`);
  }
  const ustxFee = stxToUstx(stxFee).toString();
  return { stxFee, ustxFee };
}

export async function confirm({
  msg = 'Confirm?',
  exit = true,
}: { msg?: string; exit?: boolean } = {}) {
  const { confirm } = await prompt<{ confirm: boolean }>([
    {
      name: 'confirm',
      type: 'confirm',
      message: msg,
    },
  ]);
  if (confirm === false && exit) {
    process.exit(1);
  }
  return confirm;
}

// Returns fee estimate in uSTX
export async function getFeeEstimate(tx: UnknownTx, options: Partial<ContractCallOptions> = {}) {
  const transaction = await makeContractCall({
    contractAddress: tx.contractAddress,
    contractName: tx.contractName,
    functionArgs: tx.functionArgs,
    functionName: tx.function.name,
    network: getStxNetwork(),
    senderKey: getStxPrivateKey(),
    anchorMode: AnchorMode.Any,
    ...options,
  });
  const fee = transaction.auth.spendingCondition.fee;
  return fee;
}

function replacer(key: string, value: any): any {
  if (typeof value === 'bigint') {
    return { __bigintval__: value.toString() };
  } else if (value instanceof Uint8Array) {
    return { __buff__: bytesToHex(value) };
  }
  return value;
}

function reviver(key: string, value: any): any {
  if (value != null && typeof value === 'object' && '__bigintval__' in value) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return BigInt(value['__bigintval__']);
  }
  if (value != null && typeof value === 'object' && '__buff__' in value) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return hexToBytes(value['__buff__']);
  }
  return value;
}

export function stringifyEvents(events: Event<Prints>[]) {
  return JSON.stringify(events, replacer);
}

export function parseEventsJSON(json: string) {
  const events = JSON.parse(json, reviver) as Event<Prints>[];
  return events;
}
