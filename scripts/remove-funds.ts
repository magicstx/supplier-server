import { prompt } from 'inquirer';
import { PostConditionMode } from 'micro-stacks/transactions';
import { getSupplierId } from '../src/config';
import { stacksProvider, bridgeContract } from '../src/stacks';
import { btcToSats, satsToBtc, shiftInt } from '../src/utils';
import { getStxBalance } from '../src/wallet';
import { askStxFee, broadcastAndLog } from './helpers';

async function run() {
  const bridge = bridgeContract();
  const provider = stacksProvider();

  const supplierId = getSupplierId();
  const funds = await provider.ro(bridge.getFunds(supplierId));

  const fundsMax = satsToBtc(funds);

  const answers = await prompt<{ amount: number }>([
    {
      name: 'amount',
      message: `Amount of xBTC to withdraw (max: ${fundsMax})`,
      type: 'number',
    },
  ]);

  const { amount } = answers;
  const amountSats = BigInt(btcToSats(amount));

  const { ustxFee } = await askStxFee((await getStxBalance()).stx);

  console.log(`You want to remove ${amount} xBTC (${amountSats} sats)`);

  const { confirm } = await prompt<{ confirm: boolean }>([
    {
      name: 'confirm',
      type: 'confirm',
      message: 'Confirm?',
    },
  ]);

  if (!confirm) {
    console.log('Exiting.');
    process.exit(1);
  }

  const removeTx = bridge.removeFunds(amountSats);

  await broadcastAndLog(removeTx, {
    postConditionMode: PostConditionMode.Allow,
    fee: ustxFee,
  });
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
