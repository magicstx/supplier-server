import { prompt } from 'inquirer';
import 'cross-fetch/polyfill';
import { stacksProvider, bridgeContract } from '../src/stacks';
import { bpsToPercent, satsToBtc, shiftInt } from '../src/utils';
import {
  getContractAddress,
  getPublicKey,
  getStxAddress,
  getStxNetwork,
  validateConfig,
  validateKeys,
} from '../src/config';
import { PostConditionMode } from 'micro-stacks/transactions';
import { fetchAccountBalances } from 'micro-stacks/api';

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

  const stxAddress = getStxAddress();
  const network = getStxNetwork();
  const contractAddress = getContractAddress();
  const balances = await fetchAccountBalances({
    url: network.getCoreApiUrl(),
    principal: stxAddress,
  });

  const xbtcId = `${contractAddress}.xbtc::xbtc`;
  const stxBalance = shiftInt(balances.stx.balance, -6);
  const xbtcBalanceSats = balances.fungible_tokens[xbtcId]?.balance || '0';
  const xbtcBalance = satsToBtc(xbtcBalanceSats);

  console.log(`STX Address: ${stxAddress}`);
  console.log(`STX Balance: ${stxBalance.toFormat()} STX`);
  console.log(`xBTC Balance: ${xbtcBalance} xBTC`);

  const answers = await prompt<Answers>([
    { name: 'inboundFee', message: 'Inbound fee (basis points)', type: 'number', default: '10' },
    {
      name: 'inboundBaseFee',
      message: 'Inbound base fee (satoshis)',
      type: 'number',
      default: '500',
    },
    { name: 'outboundFee', message: 'Outbound fee (basis points)', type: 'number', default: '10' },
    {
      name: 'outboundBaseFee',
      message: 'Outbound base fee (satoshis)',
      type: 'number',
      default: '500',
    },
    {
      name: 'xbtcFunds',
      message: `How much xBTC do you want to supply (in satoshis)? Max: ${xbtcBalanceSats}`,
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
  const registerTx = bridge.registerSupplier(
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
