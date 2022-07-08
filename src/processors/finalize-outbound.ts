import ElectrumClient from 'electrum-client-sl';
import { confirmationsToHeight, findStacksBlockAtHeight, getStacksBlock } from '../stacks-api';
import { contracts } from '../clarigen';
import { getBtcTxUrl, reverseBuffer } from '../utils';
import { getStxAddress } from '../config';
import { logger } from '../logger';
import { bridgeContract, stacksProvider } from '../stacks';
import {
  RedisClient,
  getAllPendingFinalizedOutbound,
  removePendingFinalizedOutbound,
  setFinalizedOutbound,
} from '../store';
import { withElectrumClient } from '../wallet';
import { fetchAccountNonce } from '../stacks-api';
import { hexToBytes } from 'micro-stacks/common';
import { TypedAbiFunction } from '@clarigen/core';

type Params<T> = T extends TypedAbiFunction<infer A, unknown> ? A : never;

type MintParams = Params<typeof contracts['bridge']['functions']['escrowSwap']>;
type BlockParam = MintParams[0];
type ProofParam = MintParams[3];

async function txData(client: ElectrumClient, txid: string) {
  const tx = await client.blockchain_transaction_get(txid, true);

  const burnHeight = await confirmationsToHeight(tx.confirmations);
  const { header, stacksHeight, prevBlocks } = await findStacksBlockAtHeight(
    burnHeight,
    [],
    client
  );

  const blockHash = tx.blockhash;

  // const { burnHeight, stacksHeight } = await getStacksBlock(blockHash);
  // const header = await client.blockchain_block_header(burnHeight);

  const merkle = await client.blockchain_transaction_getMerkle(txid, burnHeight);
  const hashes = merkle.merkle.map(hash => {
    return reverseBuffer(Buffer.from(hash, 'hex'));
  });

  const blockArg: BlockParam = {
    header: Buffer.from(header, 'hex'),
    height: BigInt(stacksHeight),
  };

  const txHex = Buffer.from(tx.hex, 'hex');

  const proofArg: ProofParam = {
    hashes: hashes,
    'tx-index': BigInt(merkle.pos),
    'tree-depth': BigInt(hashes.length),
  };

  return {
    txHex: tx.hex,
    proof: proofArg,
    block: blockArg,
    tx: txHex,
    prevBlocks: prevBlocks.map(b => hexToBytes(b)),
  };
}

export async function finalizeOutbound({
  client,
  key,
  nonce,
}: {
  client: RedisClient;
  key: string;
  nonce: number;
}) {
  const [idStr, txid] = key.split('::');
  const id = BigInt(idStr);
  const log = logger.child({
    topic: 'finalizeOutboundSwap',
    swapId: id,
    btcTxid: txid,
    btcTx: getBtcTxUrl(txid),
  });
  log.info(`Finalizing outbound ${key}`);
  const provider = stacksProvider();
  const bridge = bridgeContract();
  try {
    const stxTxid = await withElectrumClient(async client => {
      const data = await txData(client, txid);
      const finalizeTx = bridge.finalizeOutboundSwap(
        data.block,
        data.prevBlocks,
        data.tx,
        data.proof,
        0n,
        id
      );
      const receipt = await provider.tx(finalizeTx, { nonce });
      return receipt.txId;
    });
    log.debug({ stxTxid }, `Submitted finalize outbound Stacks tx: ${stxTxid}`);
    await removePendingFinalizedOutbound(client, id, txid);
    await setFinalizedOutbound(client, id, stxTxid);
    return true;
  } catch (error) {
    if (String(error) === 'Invalid height') {
      log.debug(`Cannot finalize outbound ${idStr}: no stacks block.`);
    } else {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      log.error(`Error when finalizing outbound for ID ${idStr}: ${error}`);
    }
    return false;
  }
}

export async function processPendingOutbounds(client: RedisClient) {
  const members = await getAllPendingFinalizedOutbound(client);
  if (members.length === 0) {
    return { finalized: 0 };
  }
  logger.debug({ topic: 'pendingOutbound', txids: members }, 'Pending finalized outbounds');
  const nonce = await fetchAccountNonce(getStxAddress());
  // serially to not have conflicting nonces
  let processed = 0;
  for (let i = 0; i < members.length; i++) {
    const key = members[i];
    try {
      const success = await finalizeOutbound({
        client,
        nonce: nonce + processed,
        key,
      });
      if (success) processed += 1;
    } catch (error) {
      console.error(`Unable to finalize outbound ${key}:`, error);
    }
  }
  return {
    finalized: processed,
  };
}
