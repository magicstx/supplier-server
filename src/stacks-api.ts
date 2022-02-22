import 'cross-fetch/polyfill';
import { AddressNonces, Transaction } from '@stacks/stacks-blockchain-api-types';
import { getContractAddress, getStxNetwork } from './config';
import { fetchAccountTransactions, fetchBlockByBurnBlockHash } from 'micro-stacks/api';

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
