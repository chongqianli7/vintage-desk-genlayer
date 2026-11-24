# Validation

- [Studionet transactions and latest-final readbacks](studionet.json)
- [Official GenVM lint and semantic validation](genvm-lint.txt)
- [Earlier deployment and timestamp error](earlier-deployment.json)
- [BEA original GDP advance release](https://www.bea.gov/news/2024/gross-domestic-product-third-quarter-2024-advance-estimate)

The chain uses Stable Studionet 61999. Transactions were signed by independent in-memory SDK Demo wallets. Transaction hashes can be opened under `https://explorer-studio.genlayer.com/transactions/`. The opening of an initial replay and the permission checks are retained even though an RPC error interrupted that run. Later replays use the same deployed contract.

Local unit tests use a stub runtime for HTTP 404, missing headline, HTTP 503, simulated validator disagreement, duplicate input, and clock bounds. The published chain evidence uses actual GenVM execution against the BEA release page.
