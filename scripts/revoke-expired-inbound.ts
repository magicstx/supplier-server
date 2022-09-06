import 'cross-fetch/polyfill';
import { hexToBytes } from 'micro-stacks/common';
import { stacksProvider, bridgeContract } from '../src/stacks';
import { fetchCoreInfo } from '../src/stacks-api';
import { isRevokedTxid, satsToBtc } from '../src/utils';
import { broadcastAndLog, confirm } from './helpers';

const [txidHex] = process.argv.slice(2);

async function run() {
  const provider = stacksProvider();
  const bridge = bridgeContract();
  const txid = hexToBytes(txidHex);

  console.log(`TXID you want to revoke: ${txidHex}`);

  const [swap, coreInfo, preimage] = await Promise.all([
    provider.ro(bridge.getInboundSwap(txid)),
    fetchCoreInfo(),
    provider.ro(bridge.getPreimage(txid)),
  ]);

  if (swap === null) {
    console.log('Invalid TXID: no inbound swap found.');
    process.exit(1);
  }

  if (preimage !== null) {
    if (isRevokedTxid(preimage)) {
      console.log('Already revoked. Exiting');
    } else {
      console.log('Already finalized. Exiting.');
    }
    process.exit(1);
  }

  const blockHeight = coreInfo.stacks_tip_height;
  const diff = blockHeight - Number(swap.expiration);

  if (diff < 0) {
    console.error(
      `Swap doesn't expire for ${Math.abs(diff)} blocks - do you still want to revoke?`
    );
    await confirm();
  }

  const xbtc = satsToBtc(swap.xbtc);
  console.log(`About to revoke escrowed inbound swap with ${xbtc} xBTC`);
  await confirm();

  const tx = bridge.revokeExpiredInbound(txid);
  await broadcastAndLog(tx, {});
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
