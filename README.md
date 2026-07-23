# radiochron-js

The official Node.js/npm API for the
[`radiochron`](https://github.com/sergii-ziborov/radiochron) Rust Wi-Fi
diagnostics and BLE history/risk core for applications and services.

It supports Windows x64, Linux x64/ARM64, Intel Mac, and Apple Silicon Mac. The npm
archive carries a small native adapter linked directly to the pinned Rust core;
JavaScript applications never need to parse platform commands themselves.

```sh
npm install radiochron
```

## Node API

```js
const { getRadioChronCoreClient } = require('radiochron');

const radiochron = getRadioChronCoreClient();
const interfaces = await radiochron.status();
const nearby = await radiochron.networks({ refreshScan: true });
const analysis = await radiochron.analyze();
const connectivity = await radiochron.diagnoseConnectivity({
  dnsName: 'broker.lan',
  tcpTarget: 'broker.lan:1883'
});

await radiochron.chronicle.start({ intervalSeconds: 5 });
const recentChanges = await radiochron.chronicle.recent({ maxEntries: 100 });
await radiochron.chronicle.stop();

const identity = await radiochron.ble.identify(advertisement);
await radiochron.ble.resetTracker({ persistent_unknown_ms: 60_000 });
const result = await radiochron.ble.observe(timedObservation);
const histories = await radiochron.ble.histories();
```

`radiochron/core` remains an equivalent explicit export for applications that
prefer it. The typed API covers status, scan, detailed BSS inventory, caveated
analysis, connection sampling, caller-targeted connectivity diagnosis, and the
change-only chronicle. The `ble` API accepts advertisements from any Node BLE
transport and provides protocol-aware identity, stateful history and caveated
risk evidence. It does not silently install or start a platform BLE scanner.
`call()` remains available as a low-level escape hatch.

The adapter uses a private newline-delimited request protocol between Node and
the linked Rust process. The
[`radiochron-electron`](https://github.com/sergii-ziborov/radiochron-electron)
application imports this Node API and bundles its native adapter in installers.

## Build and provenance

```sh
npm test
npm run build:core
```

`package.json` pins one exact `radiochron` core commit. `prepack` verifies the
identity and SHA-256 of every native target before it can enter the npm archive.
CI builds Windows x64, Linux x64/ARM64, Intel Mac, and Apple Silicon variants and
checks the JavaScript API on supported Node versions.

Releases are published manually from an authenticated npm console. The archive
is assembled from the five artifacts of one green CI run, `prepack` verifies
their identity/core revision/SHA-256, and `npm run verify:package` rejects Rust
`target/` output, missing platform binaries, or an unexpectedly large archive.
The version tag is pushed only after the public registry copy is verified; no
npm credential is stored in GitHub.

## Repository boundaries

- [`radiochron`](https://github.com/sergii-ziborov/radiochron) — Rust IoT core.
- [`radiochron-js`](https://github.com/sergii-ziborov/radiochron-js) — this
  Node/npm library over the core.
- [`radiochron-electron`](https://github.com/sergii-ziborov/radiochron-electron)
  — a separate desktop application consuming `radiochron-js`.

Apple hosts use CoreWLAN, Linux uses nl80211, and Windows uses the native WLAN
API through the Rust core.

Licensed under the [MIT License](LICENSE-MIT). The underlying `radiochron`
Rust core remains separately dual-licensed under MIT or Apache-2.0.
