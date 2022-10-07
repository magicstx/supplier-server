import 'cross-fetch/polyfill';
import { getContractEventsUntil } from '../src/stacks-api';
import { writeFile, readFile } from 'fs/promises';
import {
  isFinalizeInboundEvent,
  Prints,
  Event,
  isEscrowEvent,
  isInitiateOutboundEvent,
  isFinalizeOutboundEvent,
  isRevokeInboundEvent,
  isRevokeOutboundEvent,
} from '../src/events';
import { resolve } from 'path';
import { satsToBtc } from '../src/utils';
import { bytesToHex, hexToBytes } from 'micro-stacks/common';
import { parseEventsJSON, stringifyEvents } from './helpers';

const [command] = process.argv.slice(2);

async function run() {
  const dataFile = resolve(__dirname, '../tmpdata/events.json');
  // const totalInbound =
  if (command === 'write') {
    const events = await getContractEventsUntil(null);
    console.log(`Found ${events.length} events`);
    const json = stringifyEvents(events);
    await writeFile(dataFile, json, {
      encoding: 'utf-8',
    });
    return;
  } else if (command === 'pending') {
    const eventsJSON = await readFile(dataFile, { encoding: 'utf-8' });
    const events = parseEventsJSON(eventsJSON);
    events.reverse();

    // const ins: string[] = [];
    const ins = new Set<string>();
    const outs = new Set<bigint>();
    events.forEach(event => {
      if (isEscrowEvent(event)) {
        console.log('start', event.print.swapper, bytesToHex(event.print.txid));
        // console.log(event.print);
        ins.add(bytesToHex(event.print.txid));
      } else if (isInitiateOutboundEvent(event)) {
        console.log('start', event.print.swapId);
        outs.add(event.print.swapId);
      } else if (isFinalizeInboundEvent(event)) {
        // console.log('end', bytesToHex(event.print.txid));
        ins.delete(bytesToHex(event.print.txid));
      } else if (isFinalizeOutboundEvent(event)) {
        // console.log('end', event.print.swapId);
        outs.delete(event.print.swapId);
        console.log('finalized', event.print.swapId);
      } else if (isRevokeInboundEvent(event)) {
        ins.delete(bytesToHex(event.print.txid));
      } else if (isRevokeOutboundEvent(event)) {
        outs.delete(event.print.swapId);
      }
    });

    ins.forEach(txid => {
      console.log(txid);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      // const event = events.find(e => (e as any).print.txid === hexToBytes(txid));
      const event = events.find(e => {
        if (isEscrowEvent(e)) {
          console.log(bytesToHex(e.print.txid));
          return bytesToHex(e.print.txid) === txid;
        }
        return false;
      });
      console.log(event);
    });

    console.log(ins);
    console.log(outs);

    return;
  }
  const eventsJSON = await readFile(dataFile, { encoding: 'utf-8' });
  const events = parseEventsJSON(eventsJSON);
  console.log('Found events', events.length);
  let totalInbound = 0n;
  let totalOutbound = 0n;
  let totalFees = 0n;
  let swapsCount = 0;

  events.forEach(event => {
    if (isEscrowEvent(event)) {
      totalInbound += event.print.sats;
      totalFees += event.print.sats - event.print.xbtc;
      swapsCount += 1;
    } else if (isInitiateOutboundEvent(event)) {
      totalOutbound += event.print.xbtc;
      totalFees += event.print.xbtc - event.print.sats;
      swapsCount += 1;
    }
  });

  const total = totalInbound + totalOutbound;

  console.log('Total volume:', satsToBtc(total));
  console.log('Total inbound:', satsToBtc(totalInbound));
  console.log('Total outbound:', satsToBtc(totalOutbound));
  console.log('Total fees:', satsToBtc(totalFees));
  const avgFee = Number(totalFees) / swapsCount;
  console.log('Average fee:', satsToBtc(avgFee));
  console.log('Average fee %:', ((Number(totalFees) / Number(total)) * 100).toFixed(3));
  console.log('Total swaps:', swapsCount);
  // console.log('Avg fee:', ((swapsCount / Number(totalFees)) * 100).toFixed(3));

  //   // const api = getQueryApi();

  //   // if (api) {
  //   //   const lines = await api.collectLines('SELECT "ping" FROM "testPing" limit 1');
  //   //   console.log(lines.length, 'lines');
  //   // }

  //   // events.forEach(event => {
  //   //   if (isFinalizeInboundEvent(event)) {
  //   //     event.
  //   //   }
  //   //   // event.
  //   // });
  // }
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
