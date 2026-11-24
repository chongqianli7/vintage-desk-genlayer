# Vintage Desk

[Open Vintage Desk](https://chongqianli7.github.io/vintage-desk-genlayer/)

Vintage Desk is a probability forecast market for the headline U.S. real GDP growth figure. A market organizer fixes the observation quarter, release edition, official BEA page, close time, and two thresholds. Forecasters allocate 100 probability points among three exhaustive bands. Every validator reads the pinned publication independently. A matching numeric observation settles the market and writes ordered forecast scores.

## Rules

- Live markets close on or before the end of the observation quarter. Once the cutoff passes, any wallet can freeze submissions. Historical replays are separate, visibly labeled, and use an organizer freeze.
- A wallet can submit a single forecast per market, with up to 30 entrants. Probabilities and account identifiers are public.
- The point score is 20,000 minus the three-category Brier loss in integer probability points. Points have no cash value, deposits, or withdrawal.
- An independently verified period mismatch, missing headline, or HTTP 404 leaves the market pending with a reason. Transport failure or validator disagreement prevents updating the settlement. The source stays fixed on retry.
- The BEA parser supports the English headline templates for annualized increases and decreases. If the archive changes its format, the market will remain pending. A historical replay can use a known release for testing and training. It is not evidence of ex-ante forecasting skill.

## Try the desk

Open a published example, inspect the archived release, and compare each locked band with the observed outcome or pending reason. To make a new market, connect a compatible EIP-1193 wallet on Stable Studionet (61999) or choose a session-only Demo wallet, fund it from the Studio faucet, and list the terms. Switch to a separate wallet to sign a forecast. Freeze with the permitted wallet and settle by asking validators to read the release.

## Build and verify

Use Node.js 24 and Python 3. Run `npm ci`, `npm test`, and `npm run build`. The tests use a local SDK stub. Run `node scripts/live.mjs` to execute a new live testnet deployment and historical replays with actual in-memory wallet signatures. See [test evidence](evidence/README.md) for receipts, readbacks, source validation, and screenshots.
