import { NodeProvider } from '@clarigen/node';
import { contracts as allContracts, accounts } from './clarigen';
import { getContractAddress, getStxNetwork, getStxPrivateKey } from './config';

export function stacksProvider() {
  return NodeProvider({
    privateKey: getStxPrivateKey(),
    network: getStxNetwork(),
  });
}

export function bridgeContract() {
  return allContracts.bridge.contract(getContractAddress(), 'bridge');
}
