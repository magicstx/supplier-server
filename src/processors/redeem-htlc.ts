import { getBtcAddress, getBtcSigner, getOperatorId } from '../config';
import { networks, Psbt, script as bScript, payments, opcodes } from 'bitcoinjs-lib';
import { Transaction } from '@stacks/stacks-blockchain-api-types';
import BigNumber from 'bignumber.js';
import { getRedeemedHTLC, setRedeemedHTLC, RedisClient } from '../store';
import { logger } from '../logger';
import { tryBroadcast, withElectrumClient } from '../wallet';
import { bridgeContract, stacksProvider } from '../stacks';
import { hexToBytes } from 'micro-stacks/common';

export async function processFinalizedInbound(tx: Transaction, client: RedisClient) {
  if (tx.tx_type !== 'contract_call') return;
  if (tx.contract_call.function_name !== 'finalize-swap') return;
  if (!tx.contract_call.function_args) return;
  if (tx.tx_status !== 'success') return;
  try {
    const txidHex = tx.contract_call.function_args[0].repr.slice(2);
    const redeemed = await getRedeemedHTLC(client, txidHex);
    logger.debug(`Processing redeem of HTLC txid ${txidHex}`);
    if (redeemed) {
      logger.debug(`Already redeemed ${txidHex} in ${redeemed}`);
      return;
    }
    logger.info(`Redeeming HTLC ${txidHex}`);
    const txid = Buffer.from(txidHex, 'hex');
    const bridge = bridgeContract();
    const provider = stacksProvider();
    const swap = await provider.ro(bridge.getInboundSwap(txid));
    const operatorId = getOperatorId();
    if (swap?.supplier !== BigInt(operatorId)) return;
    const preimage = await provider.ro(bridge.getPreimage(txid));
    if (!preimage) return;
    const redeemTxid = await redeem(txidHex, preimage);
    await setRedeemedHTLC(client, txidHex, redeemTxid);
    return true;
  } catch (error) {
    console.error('Error redeeming HTLC', error);
  }
}

export async function redeem(txid: string, preimage: Uint8Array) {
  return withElectrumClient(async client => {
    const tx = await client.blockchain_transaction_get(txid, true);
    const txHex = Buffer.from(tx.hex, 'hex');
    const bridge = bridgeContract();
    const provider = stacksProvider();
    const swap = await provider.roOk(bridge.getFullInbound(hexToBytes(txid)));

    const psbt = new Psbt({ network: networks.regtest });
    const signer = getBtcSigner();
    const address = getBtcAddress();
    // TODO: dynamic feeRate
    const weight = 312;
    const feeRate = 1;
    const fee = weight * feeRate;

    psbt.addInput({
      hash: txid,
      index: 0,
      nonWitnessUtxo: txHex,
      redeemScript: Buffer.from(swap['redeem-script']),
    });

    psbt.addOutput({
      address,
      value: Number(swap.sats) - fee,
    });
    await psbt.signInputAsync(0, signer);

    psbt.finalizeInput(0, (index, input, script) => {
      const partialSigs = input.partialSig;
      if (!partialSigs) throw new Error('Error when finalizing HTLC input');
      const inputScript = bScript.compile([
        partialSigs[0].signature,
        Buffer.from(preimage),
        opcodes.OP_TRUE,
      ]);
      const payment = payments.p2sh({
        redeem: {
          output: script,
          input: inputScript,
        },
      });
      return {
        finalScriptSig: payment.input,
        finalScriptWitness: undefined,
      };
    });

    const final = psbt.extractTransaction();
    const finalId = final.getId();
    await tryBroadcast(client, final);
    return finalId;
  });
}
