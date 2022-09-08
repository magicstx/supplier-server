import { getBtcAddress, getBtcNetwork, getBtcSigner, getSupplierId } from '../config';
import { networks, Psbt, script as bScript, payments, opcodes } from 'bitcoinjs-lib';
import { getRedeemedHTLC, setRedeemedHTLC, RedisClient } from '../store';
import { logger as _logger } from '../logger';
import { getFeeRate, listUnspent, tryBroadcast, txWeight, withElectrumClient } from '../wallet';
import { bridgeContract, stacksProvider } from '../stacks';
import { bytesToHex, hexToBytes } from 'micro-stacks/common';
import { getBtcTxUrl, satsToBtc } from '../utils';
import { Event, isFinalizeInboundPrint } from '../events';

const logger = _logger.child({ topic: 'redeemHTLC' });

export async function processFinalizedInbound(event: Event, client: RedisClient) {
  const { print } = event;
  if (!isFinalizeInboundPrint(print)) return;
  const { preimage, supplier } = print;
  if (print.supplier !== BigInt(getSupplierId())) return;
  const txidHex = bytesToHex(print.txid);
  const l = logger.child({
    txid: txidHex,
    event: {
      preimageHex: bytesToHex(preimage),
      ...print,
    },
  });
  try {
    const redeemed = await getRedeemedHTLC(client, txidHex);
    l.info(`Processing redeem of HTLC txid ${txidHex}`);
    if (redeemed) {
      l.debug(`Already redeemed ${txidHex} in ${redeemed}`);
      return { skipped: true };
    }
    if (preimage === null) {
      l.error('Error redeeming: no preimage');
      return { error: 'No preimage' };
    }
    const redeemTxid = await redeem(txidHex, preimage);
    await setRedeemedHTLC(client, txidHex, redeemTxid);
    return {
      redeemTxid,
      amount: satsToBtc(print.xbtc),
    };
  } catch (error) {
    l.error({ error, errorString: String(error) }, `Error redeeming HTLC: ${String(error)}`);
    throw error;
  }
}

export async function redeem(txid: string, preimage: Uint8Array) {
  return withElectrumClient(async client => {
    const tx = await client.blockchain_transaction_get(txid, true);
    const txHex = Buffer.from(tx.hex, 'hex');
    const bridge = bridgeContract();
    const provider = stacksProvider();
    const swap = await provider.roOk(bridge.getFullInbound(hexToBytes(txid)));
    const network = getBtcNetwork();

    const psbt = new Psbt({ network });
    const signer = getBtcSigner();
    const address = getBtcAddress();
    const baseWeight = 312n;
    const [unspents, feeRate] = await Promise.all([listUnspent(client), getFeeRate(client)]);
    const size = baseWeight + txWeight(unspents.length, 1);
    const fee = size * BigInt(feeRate);

    psbt.addInput({
      hash: txid,
      index: Number(swap.outputIndex),
      nonWitnessUtxo: txHex,
      redeemScript: Buffer.from(swap.redeemScript),
    });

    let consolidateTotal = 0n;
    psbt.addInputs(
      await Promise.all(
        unspents.map(async coin => {
          const txHex = await client.blockchain_transaction_get(coin.tx_hash);
          consolidateTotal += BigInt(coin.value);
          return {
            hash: coin.tx_hash,
            index: coin.tx_pos,
            nonWitnessUtxo: Buffer.from(txHex, 'hex'),
          };
        })
      )
    );

    const outputAmount = consolidateTotal + swap.sats - fee;
    psbt.addOutput({
      address,
      value: Number(outputAmount),
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
    const btcAmount = satsToBtc(swap.sats);
    logger.info(
      { redeemTxid: finalId, txUrl: getBtcTxUrl(finalId), htlcTxid: txid, amount: swap.sats },
      `Redeemed inbound HTLC for ${btcAmount} BTC`
    );
    return finalId;
  });
}
