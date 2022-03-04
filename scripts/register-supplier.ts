import { prompt } from 'inquirer';
import { stacksProvider, bridgeContract } from '../src/stacks';
import { bpsToPercent, satsToBtc } from '../src/utils';
import { getPublicKey, validateConfig, validateKeys } from '../src/config';
import { PostConditionMode } from 'micro-stacks/transactions';

interface Answers {
  inboundFee: number;
  inboundBaseFee: number;
  outboundFee: number;
  outboundBaseFee: number;
  xbtcFunds: number;
  name: string;
}

async function run() {
  const provider = stacksProvider();
  const bridge = bridgeContract();

  try {
    validateKeys();
  } catch (error) {
    console.error('Unable to register supplier - environment not configured');
    console.error(error);
    return;
  }

  const answers = await prompt<Answers>([
    { name: 'inboundFee', message: 'Inbound fee (basis points)', type: 'number' },
    {
      name: 'inboundBaseFee',
      message: 'Inbound base fee (satoshis)',
      type: 'number',
      default: '500',
    },
    { name: 'outboundFee', message: 'Outbound fee (basis points)', type: 'number' },
    {
      name: 'outboundBaseFee',
      message: 'Outbound base fee (satoshis)',
      type: 'number',
      default: '500',
    },
    {
      name: 'xbtcFunds',
      message: 'How much xBTC do you want to supply (in satoshis)?',
      type: 'number',
    },
    {
      name: 'name',
      message: 'Your supplier name (registered publicly in the Magic contract)',
    },
  ]);

  const inboundFee = BigInt(answers.inboundFee);
  const inboundBaseFee = BigInt(answers.inboundBaseFee);
  const outboundFee = BigInt(answers.outboundFee);
  const outboundBaseFee = BigInt(answers.outboundBaseFee);
  const xbtcFunds = BigInt(answers.xbtcFunds);
  const { name } = answers;

  console.log(`Inbound fee: ${inboundFee} bips (${bpsToPercent(inboundFee)}%)`);
  console.log(`Inbound base fee: ${inboundBaseFee} sats (${satsToBtc(inboundBaseFee)} BTC)`);

  console.log(`Outbound fee: ${outboundFee} bips (${bpsToPercent(outboundFee)}%)`);
  console.log(`Outbound base fee: ${outboundBaseFee} sats (${satsToBtc(outboundBaseFee)} BTC)`);

  console.log(`xBTC funds: ${xbtcFunds} sats (${satsToBtc(xbtcFunds)} xBTC)`);

  console.log(`Name: ${name}`);

  const { ok } = await prompt<{ ok: boolean }>([
    { name: 'ok', type: 'confirm', message: 'Please confirm the above information is correct' },
  ]);

  if (!ok) return;

  const btcPublicKey = getPublicKey();
  const registerTx = bridge.registerOperator(
    Uint8Array.from(btcPublicKey),
    inboundFee,
    outboundFee,
    outboundBaseFee,
    inboundBaseFee,
    name,
    xbtcFunds
  );

  const { txId } = await provider.tx(registerTx, { postConditionMode: PostConditionMode.Allow });
  console.log('TXID:', txId);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
