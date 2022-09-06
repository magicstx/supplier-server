import 'cross-fetch/polyfill';
import { prompt } from 'inquirer';
import { getSupplierId } from '../src/config';
import { bridgeContract, stacksProvider } from '../src/stacks';
import { bpsToPercent, satsToBtc } from '../src/utils';
import { broadcastAndLog, confirm } from './helpers';

interface Answers {
  inboundFee: number;
  inboundBaseFee: number;
  outboundFee: number;
  outboundBaseFee: number;
}

async function run() {
  const provider = stacksProvider();
  const bridge = bridgeContract();

  const supplierId = getSupplierId();
  const supplier = await provider.ro(bridge.getSupplier(supplierId));

  if (supplier === null) {
    throw new Error(`Supplier ID (${supplierId}) invalid`);
  }

  const answers = await prompt<Answers>([
    {
      name: 'inboundFee',
      message: 'Inbound fee (basis points)',
      type: 'number',
      default: Number(supplier.inboundFee),
    },
    {
      name: 'inboundBaseFee',
      message: 'Inbound base fee (satoshis)',
      type: 'number',
      default: Number(supplier.inboundBaseFee),
    },
    {
      name: 'outboundFee',
      message: 'Outbound fee (basis points)',
      type: 'number',
      default: Number(supplier.outboundFee),
    },
    {
      name: 'outboundBaseFee',
      message: 'Outbound base fee (satoshis)',
      type: 'number',
      default: Number(supplier.outboundBaseFee),
    },
  ]);

  const inboundFee = BigInt(answers.inboundFee);
  const inboundBaseFee = BigInt(answers.inboundBaseFee);
  const outboundFee = BigInt(answers.outboundFee);
  const outboundBaseFee = BigInt(answers.outboundBaseFee);

  console.log('New fees:');
  console.log(
    `Inbound fee: ${inboundFee} bips (${bpsToPercent(inboundFee)}%) (was ${bpsToPercent(
      supplier.inboundFee === null ? 0 : supplier.inboundFee
    )}%)`
  );
  console.log(
    `Inbound base fee: ${inboundBaseFee} sats (${satsToBtc(inboundBaseFee)} BTC) (was ${
      supplier.inboundBaseFee
    } sats)`
  );

  console.log(
    `Outbound fee: ${outboundFee} bips (${bpsToPercent(outboundFee)}%) (was ${bpsToPercent(
      supplier.outboundFee === null ? 0 : supplier.outboundFee
    )}%)`
  );
  console.log(
    `Outbound base fee: ${outboundBaseFee} sats (${satsToBtc(outboundBaseFee)} BTC) (was ${
      supplier.outboundBaseFee
    } sats)`
  );

  await confirm();
  const tx = bridge.updateSupplierFees({
    inboundBaseFee,
    inboundFee,
    outboundBaseFee,
    outboundFee,
  });

  await broadcastAndLog(tx, {});
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
