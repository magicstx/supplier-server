# magic-supplier

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
