# Validation

- [Studionet transactions and latest-final readbacks](studionet.json)
- [Official GenVM lint and semantic validation](genvm-lint.txt)
- [Deployment payload source verification](source-match.json)
- [First deployment and timestamp error](earlier-deployment.json)
- [Second deployment and legacy HTTP response error](rehearsal-v2.json)
- [BEA original GDP advance release](https://www.bea.gov/news/2024/gross-domestic-product-third-quarter-2024-advance-estimate)

The chain uses Stable Studionet 61999. Transactions were signed by independent in-memory SDK Demo wallets. Transaction hashes can be opened under `https://explorer-studio.genlayer.com/transactions/`. Earlier deployments and their failures are retained. The current evidence file covers the corrected contract and both business outcomes.

Local unit tests use a stub runtime for HTTP 404, missing headline, HTTP 503, simulated validator disagreement, duplicate input, and clock bounds. The published chain evidence uses actual GenVM execution against the BEA release page.

## Browser checks

| Viewport | Settled market | Source mismatch |
| --- | --- | --- |
| 1440 × 1000 | [Desktop](desktop.png) | [Desktop](desktop-pending.png) |
| 390 × 844 | [Narrow](narrow.png) | [Narrow](narrow-pending.png) |

Chromium checked live finalized data, layout overflow, market selection and the listing form. A controlled EIP-6963 provider tested account changes and network switching, including blocking a signing request on an incorrect chain. Session-only Demo wallet creation and disconnect were checked at both sizes. The browser harness relayed actual Studio JSON-RPC responses. Physical mobile devices and real wallet extensions were outside this run.
