import { contracts } from './clarigen/next';
import { hexToCvValue, TypedAbiArg, TypedAbiFunction } from '@clarigen/core';
import { ApiEvent, getTransactionEvent } from './stacks-api';

type ResponseType<T> = T extends TypedAbiFunction<TypedAbiArg<unknown, string>[], infer R>
  ? R
  : never;

type BridgeFunctions = typeof contracts['bridge']['functions'];

type InboundSwapResponse = NonNullable<ResponseType<BridgeFunctions['getInboundSwap']>>;

type InboundSwapMeta = NonNullable<ResponseType<BridgeFunctions['getInboundMeta']>>;

type OutboundSwapResponse = NonNullable<ResponseType<BridgeFunctions['getOutboundSwap']>>;

export type InboundSwapFull = InboundSwapResponse & InboundSwapMeta;

export type EscrowPrint = InboundSwapFull & {
  topic: 'escrow';
  txid: Uint8Array;
};

export type FinalizeInboundPrint = InboundSwapResponse & {
  topic: 'finalize-inbound';
  preimage: Uint8Array;
  txid: Uint8Array;
};

export type RevokeInboundPrint = InboundSwapResponse & {
  topic: 'revoke-inbound';
  txid: Uint8Array;
};

export type InitiateOutboundPrint = OutboundSwapResponse & {
  topic: 'initiate-outbound';
  swapId: bigint;
};

export type FinalizeOutboundPrint = OutboundSwapResponse & {
  topic: 'finalize-outbound';
  swapId: bigint;
  txid: Uint8Array;
};

export type RevokeOutboundPrint = OutboundSwapResponse & {
  topic: 'revoke-outbound';
  swapId: bigint;
};

export type Prints =
  | EscrowPrint
  | FinalizeInboundPrint
  | RevokeInboundPrint
  | InitiateOutboundPrint
  | FinalizeOutboundPrint
  | RevokeOutboundPrint;

export type Topics = Prints['topic'];

export interface Event<T = Prints> {
  txid: string;
  print: T;
  index: number;
}

export const isEscrowPrint = (val: Prints): val is EscrowPrint => val.topic === 'escrow';
export const isFinalizeInboundPrint = (val: Prints): val is FinalizeInboundPrint =>
  val.topic === 'finalize-inbound';
export const isRevokeInboundPrint = (val: Prints): val is RevokeInboundPrint =>
  val.topic === 'revoke-inbound';
export const isInitiateOutboundPrint = (val: Prints): val is InitiateOutboundPrint =>
  val.topic === 'initiate-outbound';
export const isFinalizeOutboundPrint = (val: Prints): val is FinalizeOutboundPrint =>
  val.topic === 'finalize-outbound';
export const isRevokeOutboundPrint = (val: Prints): val is RevokeOutboundPrint =>
  val.topic === 'revoke-outbound';

export const isEscrowEvent = (val: Event): val is Event<EscrowPrint> =>
  val.print.topic === 'escrow';
export const isFinalizeInboundEvent = (val: Event): val is Event<FinalizeInboundPrint> =>
  val.print.topic === 'finalize-inbound';
export const isRevokeInboundEvent = (val: Event): val is Event<RevokeInboundPrint> =>
  val.print.topic === 'revoke-inbound';
export const isInitiateOutboundEvent = (val: Event): val is Event<InitiateOutboundPrint> =>
  val.print.topic === 'initiate-outbound';
export const isFinalizeOutboundEvent = (val: Event): val is Event<FinalizeOutboundPrint> =>
  val.print.topic === 'finalize-outbound';
export const isRevokeOutboundEvent = (val: Event): val is Event<RevokeOutboundPrint> =>
  val.print.topic === 'revoke-outbound';

export function getEventWithPrint<T extends Prints>(prints: Prints[], topic: T['topic']): T {
  const [found] = prints.filter(p => p.topic === topic);
  if (typeof found === 'undefined') {
    throw new Error(`No print with topic '${topic}'`);
  }
  return found as T;
}

export function getEscrowPrint(prints: Prints[]) {
  return getEventWithPrint<EscrowPrint>(prints, 'escrow');
}
export function getFinalizeInboundPrint(prints: Prints[]) {
  return getEventWithPrint<FinalizeInboundPrint>(prints, 'finalize-inbound');
}
export function getRevokeInboundPrint(prints: Prints[]) {
  return getEventWithPrint<RevokeInboundPrint>(prints, 'revoke-inbound');
}
export function getInitiateOutboundPrint(prints: Prints[]) {
  return getEventWithPrint<InitiateOutboundPrint>(prints, 'initiate-outbound');
}
export function getFinalizeOutboundPrint(prints: Prints[]) {
  return getEventWithPrint<FinalizeOutboundPrint>(prints, 'finalize-outbound');
}
export function getRevokeOutboundPrint(prints: Prints[]) {
  return getEventWithPrint<RevokeOutboundPrint>(prints, 'revoke-outbound');
}

export interface SerializedEvent<T = Prints> {
  _t?: Event<T>;
  txid: string;
  index: number;
}

export function serializeEvent<T>(event: Event<T>): SerializedEvent<T> {
  return {
    txid: event.txid,
    index: event.index,
  };
}

export function getPrintFromRawEvent<T = Prints>(event: ApiEvent): Event<T> | null {
  if (event.event_type !== 'smart_contract_log') {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const v = hexToCvValue(event.contract_log.value.hex);
  if ('topic' in v) {
    const print = v as T;
    return {
      txid: event.tx_id,
      index: event.event_index,
      print,
    };
  }
  return null;
}

export async function deserializeEvent<T>(eventData: SerializedEvent<T>): Promise<Event<T>> {
  const { index, txid } = eventData;
  const apiEvent = await getTransactionEvent(eventData.txid, eventData.index);
  const event = getPrintFromRawEvent<T>(apiEvent);
  if (event === null) throw new Error('Invalid event');
  return event;
}
