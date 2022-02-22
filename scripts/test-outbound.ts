import 'cross-fetch/polyfill';
import { getOutboundPayment } from '../src/processors/outbound';
import { bridgeContract, stacksProvider } from '../src/stacks';

const [swapIdStr] = process.argv.slice(2);
async function run() {
  const swapId = BigInt(swapIdStr);
  const bridge = bridgeContract();
  const provider = stacksProvider();
  const swap = await provider.ro(bridge.getOutboundSwap(swapId));
  if (!swap) throw new Error(`Expected outbound swap ${swapId} to exist.`);
  const { address } = getOutboundPayment(swap.hash, swap.version);
  console.log('address', address);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
