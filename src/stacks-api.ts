import 'cross-fetch/polyfill';
import { AddressNonces, Transaction } from '@stacks/stacks-blockchain-api-types';
import { getContractAddress, getStxNetwork } from './config';
import {
  fetchAccountTransactions,
  fetchBlockByBurnBlockHash,
  fetchBlockByBurnBlockHeight,
  fetchCoreApiInfo,
} from 'micro-stacks/api';
import ElectrumClient from 'electrum-client-sl';
import { logger } from './logger';
import { getTxUrl } from './utils';

export async function getStacksBlock(
  hash: string
): Promise<{ stacksHeight: number; burnHeight: number }> {
  const network = getStxNetwork();
  try {
    const block = await fetchBlockByBurnBlockHash({
      url: network.getCoreApiUrl(),
      burn_block_hash: hash,
    });
    return {
      stacksHeight: block.height,
      burnHeight: block.burn_block_height,
    };
  } catch (error) {
    console.error(error);
    console.error(`Unable to find stacks block for burn hash ${hash}`);
    throw new Error(`Unable to find stacks block for burn hash ${hash}`);
  }
}

export async function getStacksHeight(burnHeight: number) {
  const network = getStxNetwork();
  try {
    const url = network.getCoreApiUrl();
    const block = await fetchBlockByBurnBlockHeight({
      url,
      burn_block_height: burnHeight,
    });
    return block.height;
  } catch (error) {
    return undefined;
  }
}

interface StacksBlockByHeight {
  header: string;
  prevBlocks: string[];
  stacksHeight: number;
}
export async function findStacksBlockAtHeight(
  height: number,
  prevBlocks: string[],
  electrumClient: ElectrumClient
): Promise<StacksBlockByHeight> {
  const [header, stacksHeight] = await Promise.all([
    electrumClient.blockchain_block_header(height),
    getStacksHeight(height),
  ]);
  if (typeof stacksHeight !== 'undefined') {
    return {
      header,
      prevBlocks,
      stacksHeight,
    };
  }
  prevBlocks.unshift(header);
  return findStacksBlockAtHeight(height + 1, prevBlocks, electrumClient);
}

export async function confirmationsToHeight(confirmations: number) {
  const network = getStxNetwork();
  const url = network.getCoreApiUrl();
  const nodeInfo = await fetchCoreApiInfo({ url });
  const curHeight = nodeInfo.burn_block_height;
  const height = curHeight - confirmations + 1;
  return height;
}

function txLabel(tx: Transaction) {
  if (tx.tx_type !== 'contract_call') return '';
  return tx.contract_call.function_name;
}

export async function getContractTxUntil(
  txid: string | null,
  txs: Transaction[] = []
): Promise<Transaction[]> {
  const deployer = getContractAddress();
  const network = getStxNetwork();
  const response = await fetchAccountTransactions({
    principal: `${deployer}.bridge`,
    offset: txs.length,
    limit: 50,
    url: network.getCoreApiUrl(),
  });
  const results = response.results as Transaction[];
  let foundLast = false;
  for (let i = 0; i < results.length; i++) {
    const tx = results[i];
    if (tx.tx_id === txid) {
      foundLast = true;
      break;
    }
    logger.debug(
      {
        tx: tx.tx_id,
        txUrl: getTxUrl(tx.tx_id),
        method: txLabel(tx),
      },
      'New bridge transaction'
    );
    txs.push(tx);
  }
  if (foundLast || results.length === 0) {
    return txs;
  }
  return await getContractTxUntil(txid, txs);
}

export async function fetchAccountNonce(address: string) {
  const network = getStxNetwork();
  const url = `${network.getCoreApiUrl()}/extended/v1/address/${address}/nonces`;
  const res = await fetch(url);
  const data = (await res.json()) as AddressNonces;
  return data.possible_next_nonce;
}

export async function getNonce(address: string) {
  const network = getStxNetwork();
  const url = `${network.getCoreApiUrl()}/v2/accounts/${address}?unanchored=true&proof=0`;
  const res = await fetch(url);
  const data = (await res.json()) as { nonce: number };
  return data.nonce;
}
