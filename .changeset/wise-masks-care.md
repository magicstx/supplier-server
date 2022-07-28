---
'magic-supplier': patch
---

Added a 'maxSize' option to sending BTC. When sending BTC for an outbound swap, a max size of 1024 bytes is used to prevent sending BTC that isn't able to be confirmed by Clarity.
