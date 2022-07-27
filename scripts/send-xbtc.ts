import 'dotenv/config';
import 'cross-fetch/polyfill';
import { prompt } from 'inquirer';
import {
  validateStacksAddress,
  privateKeyToStxAddress,
  StacksNetworkVersion,
} from 'micro-stacks/crypto';
import { noneCV, principalCV, uintCV } from 'micro-stacks/clarity';
import {
  AnchorMode,
  broadcastTransaction,
  createAssetInfo,
  FungibleConditionCode,
  makeContractCall,
  makeStandardFungiblePostCondition,
  PostConditionMode,
} from 'micro-stacks/transactions';
import { StacksTestnet } from 'micro-stacks/network';

// type definitions

interface Answers {
  recipient: string;
  amount: number;
  fee: number;
}

interface Balances {
  ustx: number;
  xbtc: number;
}

// helpers

const toMacro = (value: number, decimals: number) => (value / 10 ** decimals).toFixed(decimals);
const printDivider = () => console.log(`------------------------------`);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const networkVersion = StacksNetworkVersion.testnetP2PKH;
const stacksNetwork = new StacksTestnet({
  coreApiUrl: 'https://stacks-node-api.testnet.stacks.co',
});

// fetchers

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url);
  if (response.status === 200) {
    const json = await response.json();
    return json;
  }
  console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  process.exit(1);
}

async function fetchBalances(principal: string): Promise<Balances> {
  const url = `https://stacks-node-api.testnet.stacks.co/extended/v1/address/${principal}/balances`;
  const result = await fetchJson(url);
  return {
    ustx: result.stx.balance,
    xbtc: result.fungible_tokens[
      'ST2ZTY9KK9H0FA0NVN3K8BGVN6R7GYVFG6BE7TAR1.Wrapped-Bitcoin::wrapped-bitcoin'
    ]
      ? result.fungible_tokens[
          'ST2ZTY9KK9H0FA0NVN3K8BGVN6R7GYVFG6BE7TAR1.Wrapped-Bitcoin::wrapped-bitcoin'
        ].balance
      : 0,
  };
}

async function fetchNonce(principal: string): Promise<number> {
  const url = `https://stacks-node-api.testnet.stacks.co/extended/v1/address/${principal}/nonces`;
  const result = await fetchJson(url);
  return +result.possible_next_nonce;
}

// main thread

async function run() {
  printDivider();
  console.log('ACCOUNT INFO');
  printDivider();
  if (!process.env.SUPPLIER_STX_KEY) {
    console.error('SUPPLIER_STX_KEY not found in .env file.');
    process.exit(1);
  }
  const address = privateKeyToStxAddress(process.env.SUPPLIER_STX_KEY, networkVersion);
  console.log(`address:`);
  console.log(`  ${address}`);
  const balances = await fetchBalances(address);
  console.log('balances:');
  console.log(`  ${toMacro(balances.ustx, 6)} STX`);
  console.log(`  ${toMacro(balances.xbtc, 8)} xBTC`);
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
      message: 'Amount of micro-xBTC to send?',
    },
    {
      name: 'fee',
      type: 'number',
      message: 'Amount of uSTX for fee?',
    },
  ]);
  if (!validateStacksAddress(answers.recipient) || address === answers.recipient) {
    console.error('Invalid recipient address.');
    process.exit(1);
  }
  if (isNaN(answers.amount) || balances.xbtc < answers.amount) {
    console.error('Insufficient xBTC balance for transfer.');
    process.exit(1);
  }
  if (isNaN(answers.fee) || balances.ustx < answers.fee) {
    console.error('Insufficient uSTX balance for fee.');
    process.exit(1);
  }
  printDivider();
  console.log('BUILD TRANSACTION');
  printDivider();
  const nonce = await fetchNonce(address);
  console.log(`nonce: ${nonce}`);
  console.log(`from: ${address}`);
  console.log(`to: ${answers.recipient}`);
  console.log(`amount: ${toMacro(answers.amount, 8)} xBTC`);
  console.log(`fee: ${toMacro(answers.fee, 6)} STX`);
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
  const txOptions = {
    contractAddress: 'ST2ZTY9KK9H0FA0NVN3K8BGVN6R7GYVFG6BE7TAR1',
    contractName: 'Wrapped-Bitcoin',
    functionName: 'transfer',
    functionArgs: [
      uintCV(answers.amount),
      principalCV(address),
      principalCV(answers.recipient),
      noneCV(),
    ],
    senderKey: process.env.SUPPLIER_STX_KEY,
    fee: answers.fee,
    nonce: nonce,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [
      makeStandardFungiblePostCondition(
        address,
        FungibleConditionCode.Equal,
        answers.amount,
        createAssetInfo(
          'ST2ZTY9KK9H0FA0NVN3K8BGVN6R7GYVFG6BE7TAR1',
          'Wrapped-Bitcoin',
          'wrapped-bitcoin'
        )
      ),
    ],
    network: stacksNetwork,
    anchorMode: AnchorMode.Any,
  };
  printDivider();
  console.log('SEND TRANSACTION');
  printDivider();
  console.log('pausing for 10sec');
  await sleep(10000);
  try {
    const tx = await makeContractCall(txOptions);
    await broadcastTransaction(tx, stacksNetwork);
    console.log(`TXID: 0x${tx.txid()}`);
    console.log(`LINK: https://explorer.stacks.co/txid/0x${tx.txid()}?chain=testnet`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
  printDivider();
  console.log('Transfer successfully submitted!');
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
