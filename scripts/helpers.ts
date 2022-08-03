import 'cross-fetch/polyfill';
import { ContractCallTyped, TypedAbiArg } from '@clarigen/core';
import BigNumber from 'bignumber.js';
import { prompt } from 'inquirer';
import { ContractCallOptions } from 'micro-stacks/transactions';
import { stacksProvider } from '../src/stacks';
import { getTxUrl, shiftInt, stxToUstx } from '../src/utils';

export async function broadcastAndLog(
  tx: ContractCallTyped<TypedAbiArg<unknown, string>[], unknown>,
  options: Partial<ContractCallOptions>
) {
  const provider = stacksProvider();
  const { txId } = await provider.tx(tx, options);
  console.log(`Broadcasted: ${getTxUrl(txId)}`);
}

export async function askStxFee(max: number | string) {
  const { stxFee } = await prompt<{ stxFee: number }>([
    {
      name: 'stxFee',
      message: `How many STX to spend on the network fee for this transaction (in STX)? Max: ${max} STX`,
      type: 'number',
    },
  ]);
  if (new BigNumber(max).lt(stxFee)) {
    throw new Error(`Invalid fee (${stxFee}). Max: ${max}`);
  }
  const ustxFee = stxToUstx(stxFee).toString();
  return { stxFee, ustxFee };
}
