import { prompt } from 'inquirer';
import { AnchorMode, broadcastTransaction, makeSTXTokenTransfer } from 'micro-stacks/transactions';
import { getStxPrivateKey, getStxNetwork } from '../src/config';
import { stxToUstx } from '../src/utils';

async function run() {
  const answers = await prompt<{ recipient: string; amount: number; fee: number }>([
    {
      name: 'recipient',
      message: 'Recipient',
    },
    {
      name: 'amount',
      type: 'number',
      message: 'Amount (STX)',
    },
    {
      name: 'fee',
      type: 'number',
      message: 'Fee (STX)',
      default: 0.001,
    },
  ]);
  console.log(answers);
  const amount = stxToUstx(answers.amount).toString();
  const fee = stxToUstx(answers.fee).toString();
  const network = getStxNetwork();
  const tx = await makeSTXTokenTransfer({
    senderKey: getStxPrivateKey(),
    recipient: answers.recipient,
    amount,
    network,
    anchorMode: AnchorMode.Any,
    fee,
  });

  const receipt = await broadcastTransaction(tx, network);
  console.log(receipt);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
