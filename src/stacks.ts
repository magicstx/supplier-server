import { NodeProvider } from '@clarigen/node';
import { contractFactory } from '@clarigen/core';
import { contracts as _contracts } from './clarigen/single';
import { getContractAddress, getStxNetwork, getStxPrivateKey } from './config';

export function getContracts() {
  const deployer = getContractAddress();
  const factory = contractFactory(_contracts, deployer);
  return factory;
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
