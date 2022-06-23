import { prompt } from 'inquirer';
import 'cross-fetch/polyfill';
import { stacksProvider, bridgeContract } from '../src/stacks';
import { bpsToPercent, btcToSats, satsToBtc, shiftInt } from '../src/utils';
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
import BigNumber from 'bignumber.js';
import { getBtcBalance, getStxBalance } from '../src/wallet';

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

  const stxBalances = await getStxBalance();

  const xbtcId = `${contractAddress}.xbtc::xbtc`;
  const stxBalance = shiftInt(balances.stx.balance, -6);
  const xbtcBalanceSats = balances.fungible_tokens[xbtcId]?.balance || '0';
  const xbtcBalance = satsToBtc(xbtcBalanceSats);
  const btcBalances = await getBtcBalance();
  const btcBalance = satsToBtc(btcBalances.total);

  console.log(`STX Address: ${stxAddress}`);
  console.log(`STX Balance: ${stxBalances.stx} STX`);
  console.log(`xBTC Balance: ${stxBalances.xbtc} xBTC`);
  console.log(`BTC Balance: ${btcBalance} BTC`);

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
      message: `How much xBTC do you want to supply (in xBTC)? Max: ${xbtcBalance}`,
      type: 'number',
    },
  ]);

  const inboundFee = BigInt(answers.inboundFee);
  const inboundBaseFee = BigInt(answers.inboundBaseFee);
  const outboundFee = BigInt(answers.outboundFee);
  const outboundBaseFee = BigInt(answers.outboundBaseFee);
  // const xbtcFunds = BigInt(answers.xbtcFunds);
  const xbtcFunds = new BigNumber(answers.xbtcFunds).decimalPlaces(8);
  const xbtcFundsSats = btcToSats(xbtcFunds.toString());

  console.log(`Inbound fee: ${inboundFee} bips (${bpsToPercent(inboundFee)}%)`);
  console.log(`Inbound base fee: ${inboundBaseFee} sats (${satsToBtc(inboundBaseFee)} BTC)`);

  console.log(`Outbound fee: ${outboundFee} bips (${bpsToPercent(outboundFee)}%)`);
  console.log(`Outbound base fee: ${outboundBaseFee} sats (${satsToBtc(outboundBaseFee)} BTC)`);

  console.log(`xBTC funds: ${xbtcFunds.toFormat()} xBTC (${xbtcFundsSats} sats)`);

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
    BigInt(xbtcFundsSats)
  );

  const { txId } = await provider.tx(registerTx, { postConditionMode: PostConditionMode.Allow });
  console.log('TXID:', txId);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
