import 'cross-fetch/polyfill';
import { prompt } from 'inquirer';
import { validateStacksAddress } from 'micro-stacks/crypto';
import {
  FungibleConditionCode,
  makeStandardFungiblePostCondition,
} from 'micro-stacks/transactions';
import { fetchAccountNonce } from '../src/stacks-api';
import { getBalances } from '../src/wallet';
import { getStxAddress, validateConfig } from '../src/config';
import { askStxFee, broadcastAndLog } from './helpers';
import { xbtcAssetInfo, xbtcContract } from '../src/stacks';
import { btcToSats } from '../src/utils';

// type definitions

interface Answers {
  recipient: string;
  amount: number;
  fee: number;
}

// helpers

const printDivider = () => console.log(`------------------------------`);

// main thread

async function run() {
  const xbtc = xbtcContract();
  printDivider();
  console.log('ACCOUNT INFO');
  printDivider();
  validateConfig();
  const address = getStxAddress();
  console.log(`address:`);
  console.log(`  ${address}`);
  const balances = await getBalances();
  console.log('balances:');
  console.log(`  ${balances.stx.stx} STX`);
  console.log(`  ${balances.xbtc.xbtc} xBTC`);
  printDivider();
  console.log('CONFIGURATION');
  printDivider();
  const answers = await prompt<Answers>([
    {
      name: 'recipient',
      type: 'input',
      message: 'Recipient address:',
    },
    {
      name: 'amount',
      type: 'number',
      message: `Amount of xBTC to send? Max: ${balances.xbtc.xbtc} xBTC`,
    },
    {
      name: 'fee',
      type: 'number',
      message: 'Amount of uSTX for fee?',
    },
  ]);

  const { ustxFee: fee, stxFee } = await askStxFee(balances.stx.stx);

  const { amount, recipient } = answers;

  const amountSats = BigInt(btcToSats(amount));

  if (!validateStacksAddress(recipient) || address === recipient) {
    console.error('Invalid recipient address.');
    process.exit(1);
  }

  if (isNaN(amount) || balances.xbtc.xbtc < amount) {
    console.error('Insufficient xBTC balance for transfer.');
    process.exit(1);
  }

  printDivider();
  console.log('BUILD TRANSACTION');
  printDivider();

  const nonce = await fetchAccountNonce(address);

  console.log(`nonce: ${nonce}`);
  console.log(`from: ${address}`);
  console.log(`to: ${recipient}`);
  console.log(`amount: ${amount} xBTC`);
  console.log(`fee: ${stxFee} STX`);

  const { confirm } = await prompt<{ confirm: boolean }>([
    {
      name: 'confirm',
      type: 'confirm',
      message: 'Confirm details above?',
    },
  ]);

  if (!confirm) {
    console.error('Details not confirmed.');
    process.exit(1);
  }

  const transferTx = xbtc.transfer(amountSats, address, recipient, null);

  const postCondition = makeStandardFungiblePostCondition(
    address,
    FungibleConditionCode.Equal,
    amountSats,
    xbtcAssetInfo()
  );

  printDivider();
  console.log('SEND TRANSACTION');
  printDivider();

  await broadcastAndLog(transferTx, {
    postConditions: [postCondition],
    fee,
  });
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
