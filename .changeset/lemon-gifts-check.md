---
'magic-supplier': patch
---

Better backoff and retry logic for some worker jobs:

- The balances job runs less often (now every 5 minutes)
- The `finalize` jobs retry every 10 minutes, and retry for more instances, to account for expected block times and confirmation delays

Various small fixes regarding code quality:

- Instead of checking for `undefined` with `typeof val === 'undefined'`, added `isNullish` and `isNotNullish` helpers that check against `null` and `undefined`
- Removed unused imports and variables
