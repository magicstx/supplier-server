import 'cross-fetch/polyfill';
import { hexToBytes } from 'micro-stacks/common';
import { redeem } from '../src/processors/redeem-htlc';
import { bridgeContract, stacksProvider } from '../src/stacks';
import { getBtcTxUrl } from '../src/utils';

const [txidHex] = process.argv.slice(2);

async function run() {
  const provider = stacksProvider();
  const bridge = bridgeContract();
  const txid = hexToBytes(txidHex);
  const preimage = await provider.ro(bridge.getPreimage(txid));
  if (preimage === null) {
    throw new Error('Invalid swap - not finalized');
  }
  const redeemTxid = await redeem(txidHex, preimage);
  console.log(getBtcTxUrl(redeemTxid));
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
