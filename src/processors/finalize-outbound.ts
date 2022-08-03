import ElectrumClient from 'electrum-client-sl';
import { fetchCoreInfo, findStacksBlockAtHeight, getTransaction } from '../stacks-api';
import { getBtcTxUrl, reverseBuffer } from '../utils';
import { getStxAddress } from '../config';
import { logger } from '../logger';
import {
  bridgeContract,
  stacksProvider,
  BridgeContract,
  getOutboundSwap,
  getOutboundFinalizedTxid,
} from '../stacks';
import {
  RedisClient,
  getAllPendingFinalizedOutbound,
  removePendingFinalizedOutbound,
  setFinalizedOutbound,
  getFinalizedOutbound,
} from '../store';
import { withElectrumClient } from '../wallet';
import { fetchAccountNonce } from '../stacks-api';
import { hexToBytes } from 'micro-stacks/common';
import { ExtractArgs } from '@clarigen/core';

type MintParams = ExtractArgs<BridgeContract['functions']['escrowSwap']>;
type BlockParam = MintParams[0];
type ProofParam = MintParams[3];

async function txData(client: ElectrumClient, txid: string) {
  const [tx, nodeInfo] = await Promise.all([
    client.blockchain_transaction_get(txid, true),
    fetchCoreInfo(),
  ]);
  const burnHeight = nodeInfo.burn_block_height - tx.confirmations + 1;

  const { header, stacksHeight, prevBlocks } = await findStacksBlockAtHeight(
    burnHeight,
    [],
    client
  );

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
    txIndex: BigInt(merkle.pos),
    treeDepth: BigInt(hashes.length),
  };

  return {
    txHex: tx.hex,
    proof: proofArg,
    block: blockArg,
    tx: txHex,
    prevBlocks: prevBlocks.map(b => hexToBytes(b)),
  };
}

/**
 * Check if we should submit a finalization transaction for a swap.
 *
 * If there is a pending STX transaction, check the status of it:
 *   - pending: dont finalize
 *   - success: dont finalize, remove pending finalization from store
 *   - failed: retry finalize
 *
 * If there is no pending tx (this is first attempt), submit one
 *
 * @param swapId swap ID
 * @param txid btc TXID
 * @returns whether or not to submit a finalization tx
 */
export async function checkShouldFinalize(
  client: RedisClient,
  swapId: bigint,
  txid: string
): Promise<boolean> {
  const stxTxid = await getFinalizedOutbound(client, swapId);
  if (stxTxid === null) {
    return true;
  }
  const swap = await getOutboundSwap(swapId);

  const log = logger.child({
    topic: 'finalizeOutboundError',
    swapId,
    stxTxid,
    txid,
  });

  if (swap === null) {
    await removePendingFinalizedOutbound(client, swapId, txid);
    log.fatal('Trying to finalize non-existant swap');
    return false;
  }

  const stxTx = await getTransaction(stxTxid);
  const { tx_status } = stxTx;
  switch (tx_status) {
    case 'pending': {
      return false;
    }
    case 'success': {
      log.info({ finalizeOutboundState: 'success' });
      await removePendingFinalizedOutbound(client, swapId, txid);
      return false;
    }
  }

  // Failed - should we try again? (yes until revoked)

  const finalizeTxid = await getOutboundFinalizedTxid(swapId);
  if (finalizeTxid !== null) {
    // This swap was already finalized (either successfully or as a revocation)
    await removePendingFinalizedOutbound(client, swapId, txid);
    if (finalizeTxid === '00') {
      // revoked
      log.error({ finalizeOutboundState: 'revoked' }, 'Outbound swap was revoked');
    } else {
      log.info({ finalizeOutboundState: 'success' }, 'Swap already finalized');
    }
    return false;
  }

  log.error(
    {
      tx_status,
      finalizeOutboundState: 'failed',
    },
    'Outbound finalize transaction failed'
  );
  return true;
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
  const shouldFinalize = await checkShouldFinalize(client, id, txid);
  if (!shouldFinalize) {
    return false;
  }
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
