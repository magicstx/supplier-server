---
'magic-supplier': patch
---

Changed the logic for fetching recent bridge events to safely exit if it detects a chain-state change while fetching events. This prevents any race conditions from preventing the supplier from properly handling events.
