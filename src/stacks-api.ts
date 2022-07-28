import 'cross-fetch/polyfill';
import { fetch } from 'cross-fetch';
import { AddressNonces, Transaction, TransactionEvent } from '@stacks/stacks-blockchain-api-types';
import { getStxNetwork } from './config';
import {
  fetchAccountTransactions,
  fetchBlockByBurnBlockHash,
  fetchBlockByBurnBlockHeight,
  fetchContractEventsById,
  fetchCoreApiInfo,
  fetchTransaction,
} from 'micro-stacks/api';
import ElectrumClient from 'electrum-client-sl';
import { logger } from './logger';
import { getTxUrl } from './utils';
import { bridgeContract } from './stacks';
import { CoreNodeEventType, filterEvents, hexToCvValue, SmartContractEvent } from '@clarigen/core';
import { Prints, Event, getPrintFromRawEvent } from './events';
import { cvToValue } from 'micro-stacks/clarity';

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

export async function fetchCoreInfo() {
  return fetchCoreApiInfo({
    url: getStxNetwork().getCoreApiUrl(),
  });
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
  const nodeInfo = await fetchCoreInfo();
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
  const network = getStxNetwork();
  const principal = bridgeContract().identifier;
  const response = await fetchAccountTransactions({
    principal,
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

export type ApiEvents = Awaited<ReturnType<typeof fetchContractEventsById>>;
export type ApiEvent = ApiEvents[0];

export interface ApiEventResponse {
  results: ApiEvents;
}

export async function getBridgeEvents(offset = 0): Promise<ApiEventResponse> {
  const network = getStxNetwork();
  const contractId = bridgeContract().identifier;
  const response = (await fetchContractEventsById({
    url: network.getCoreApiUrl(),
    contract_id: contractId,
    unanchored: false,
    offset,
  })) as unknown as ApiEventResponse;
  return response;
}

export async function getContractEventsUntil(
  txid: string | null,
  events: Event[] = [],
  offset = 0
): Promise<Event[]> {
  const { results } = await getBridgeEvents(offset);

  let foundLast = false;
  for (let i = 0; i < results.length; i++) {
    const apiEvent = results[i];
    if (apiEvent.tx_id === txid) {
      foundLast = true;
      break;
    }
    const event = getPrintFromRawEvent(apiEvent);
    if (event === null) continue;
    logger.info(
      {
        topic: 'contractEvent',
        txUrl: getTxUrl(apiEvent.tx_id),
        txid: apiEvent.tx_id,
        event: event.print,
      },
      `New bridge tx: ${event.print.topic}`
    );
    events.push(event);
  }
  if (foundLast || results.length === 0) {
    return events;
  }
  return getContractEventsUntil(txid, events, offset + results.length);
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

export interface EventListParams {
  event_offset?: number;
  event_limit?: number;
}

export async function getTransaction(txid: string, eventParams: EventListParams = {}) {
  const network = getStxNetwork();
  const tx = await fetchTransaction({
    txid,
    url: network.getCoreApiUrl(),
    ...eventParams,
  });
  return tx;
}

export async function getTransactionEvent(txid: string, index: number) {
  const tx = await getTransaction(txid, {
    event_offset: index,
    event_limit: 1,
  });

  if (tx.tx_status !== 'success') {
    throw new Error('Invalid tx - not confirmed.');
  }

  return tx.events[0];
}
