import 'cross-fetch/polyfill';
import { prompt } from 'inquirer';
import { PostConditionMode } from 'micro-stacks/transactions';
import { bridgeContract } from '../src/stacks';
import { btcToSats } from '../src/utils';
import { getStxBalance } from '../src/wallet';
import { broadcastAndLog, confirm } from './helpers';

async function run() {
  const balances = await getStxBalance();
  const xbtcBalance = balances.xbtc;

  console.log(`Current balance: ${xbtcBalance} xBTC`);
  const useMax = await confirm({ msg: 'Add full xBTC balance?', exit: false });
  let funds = xbtcBalance;
  if (!useMax) {
    const { amount } = await prompt<{ amount: number }>({
      type: 'number',
      message: 'How much xBTC do you want to add?',
      name: 'amount',
    });
    if (amount <= 0 || isNaN(amount)) {
      throw new Error('Invalid input');
    }
    if (amount > xbtcBalance) {
      throw new Error(`Invalid amount - ${amount} is higher than max of ${xbtcBalance}`);
    }
    funds = amount;
  }

  const xbtcSats = BigInt(btcToSats(funds));
  console.log(`Adding ${funds} xBTC (${xbtcSats} sats)`);

  await confirm();
  const tx = bridgeContract().addFunds(xbtcSats);

  await broadcastAndLog(tx, {
    postConditionMode: PostConditionMode.Allow,
  });
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
