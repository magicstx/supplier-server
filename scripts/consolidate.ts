import { getFeeRate, listUnspent, txWeight, withElectrumClient } from '../src/wallet';
import { Psbt } from 'bitcoinjs-lib';
import { getBtcPayment, getBtcNetwork, getBtcSigner } from '../src/config';
import { btcToSats, getBtcTxUrl, satsToBtc } from '../src/utils';
import { prompt } from 'inquirer';

async function run() {
  const network = getBtcNetwork();
  const { address } = getBtcPayment();
  const signer = getBtcSigner();
  if (!address) throw new Error('Invalid BTC wallet configuration');
  const psbt = new Psbt({ network });
  await withElectrumClient(async client => {
    const [unspents, feeRate] = await Promise.all([listUnspent(client), getFeeRate(client)]);
    const size = txWeight(unspents.length, 1);
    const fee = size * BigInt(feeRate);

    if (unspents.length < 2) {
      console.log(`Not consolidating - only ${unspents.length} input`);
      return;
    }

    let total = 0n;
    psbt.addInputs(
      await Promise.all(
        unspents.map(async coin => {
          const txHex = await client.blockchain_transaction_get(coin.tx_hash);
          total += BigInt(coin.value);
          return {
            hash: coin.tx_hash,
            index: coin.tx_pos,
            nonWitnessUtxo: Buffer.from(txHex, 'hex'),
          };
        })
      )
    );

    const outAmount = total - fee;

    psbt.addOutput({
      address,
      value: Number(outAmount),
    });

    await psbt.signAllInputsAsync(signer);
    psbt.finalizeAllInputs();

    const tx = psbt.extractTransaction();

    console.log(`Total BTC: ${satsToBtc(total)}`);
    console.log(`Fee (BTC): ${satsToBtc(fee)}`);
    console.log(`Fee rate: ${feeRate}`);
    console.log(`Inputs: ${unspents.length}`);

    const { confirm } = await prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Send transaction?',
      },
    ]);

    if (confirm) {
      const txid = await client.blockchain_transaction_broadcast(tx.toHex());
      console.log('Broadcasted!');
      console.log(getBtcTxUrl(txid));
      // console.log('Raw:', tx.toHex());
    }
  });
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
