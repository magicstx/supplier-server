import { NodeProvider } from '@clarigen/node';
import { deploymentFactory, DeploymentPlan } from '@clarigen/core';
import { contracts as _contracts } from './clarigen';
import { getNetworkKey, getStxNetwork, getStxPrivateKey } from './config';
import { devnetDeployment } from './clarigen/deployments/devnet';
import { testnetDeployment } from './clarigen/deployments/testnet';
import { bytesToHex } from 'micro-stacks/common';

export function getContracts() {
  return deploymentFactory(_contracts, getDeployment());
}

export function stacksProvider() {
  return NodeProvider({
    privateKey: getStxPrivateKey(),
    network: getStxNetwork(),
  });
}

export function bridgeContract() {
  return getContracts().bridge;
}

export function xbtcContract() {
  return getContracts().wrappedBitcoin;
}

export function xbtcAssetId() {
  const contract = xbtcContract();
  const asset = contract.fungible_tokens[0].name;
  return `${contract.identifier}::${asset}`;
}

export function getDeployment(): DeploymentPlan {
  const networkKey = getNetworkKey();
  if (networkKey === 'mocknet') {
    return devnetDeployment;
  } else if (networkKey === 'testnet') {
    return testnetDeployment;
  } else if (networkKey === 'mainnet') {
    throw new Error('No deployment plan for mainnet yet.');
  }
  throw new Error(`No deployment found for network '${networkKey}'`);
}

export async function getOutboundFinalizedTxid(swapId: bigint | number) {
  const provider = stacksProvider();
  const txid = await provider.ro(bridgeContract().getCompletedOutboundSwapTxid(swapId));
  return txid ? bytesToHex(txid) : null;
}

export async function getOutboundSwap(swapId: bigint) {
  const { ro } = stacksProvider();
  const swap = await ro(bridgeContract().getOutboundSwap(swapId));
}
