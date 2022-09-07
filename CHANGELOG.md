# magic-supplier

## 1.3.0

### Minor Changes

- dc465e5: Fixed an issue when redeeming an inbound HTLC when the BTC prevout index was non-zero

### Patch Changes

- a632272: Adds script for updating fees

## 1.2.4

### Patch Changes

- 09d8c13: Adds scripts for adding xBTC funds and revoking expired outbound swaps
- 09d8c13: Added better logging and logic to "finalize outbound swap" processor

## 1.2.3

### Patch Changes

- 929337c: Fixes fee estimation math
- 929337c: Throw full error when unable to redeem inbound

## 1.2.2

### Patch Changes

- 0c1f977: Fix to fetch transactions with unanchored state when processing events
- 0c1f977: Fixed a network-config issue when redeeming inbound HTLC

## 1.2.1

### Patch Changes

- 6583be1: Updates mainnet contract address

## 1.2.0

### Minor Changes

- bf5689c: Updates deployed testnet address

### Patch Changes

- f81cc9d: Adds a `consolidate` script, which can be run manually to consolidate UTXOs in the supplier's BTC wallet.
- 0a40064: Adds dynamic fee rates for BTC transactions, using Electrum to estimate the appropriate fee rate.
- 32a47d0: Added robust error handling in the case where an outbound finalization transaction fails.
- bb75fb6: Adds an `stx-transfer` script
- 18b2dc6: Added more explicit retry logic for finalizing inbound and outbound transactions.
- 8f3a252: Changed the logic for fetching recent bridge events to safely exit if it detects a chain-state change while fetching events. This prevents any race conditions from preventing the supplier from properly handling events.
- bb6047b: Added a 'maxSize' option to sending BTC. When sending BTC for an outbound swap, a max size of 1024 bytes is used to prevent sending BTC that isn't able to be confirmed by Clarity.

## 1.1.2

### Patch Changes

- 25d984d: Added a prompt to specify STX fee when registering supplier

## 1.1.1

### Patch Changes

- f999364: Added configuration for self-hosted Grafana and Loki to `render.yaml`

## 1.1.0

### Minor Changes

- 05ae3b5: Refactored the main supplier workflow to work as a background job architecture. This allows for hosting the supplier server without allowing any incoming connections from external networks. Additionally, configuration is provided to easily host the supplier on Render.com with secure configuration.

### Patch Changes

- 05ae3b5: Updated internal config to support Magic on Mainnet! Now, use `SUPPLIER_NETWORK=mainnet` to launch the project in mainnet mode.
- 05ae3b5: Fixed an issue where `yarn check-config` would fail if `SUPPLIER_ID` was not set

## 1.0.1

### Patch Changes

- Welcome to the first "version" of the Magic supplier server!
