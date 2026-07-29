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

Both module systems are first-class:

```js
// CommonJS
const { getRadioChronCoreClient } = require('radiochron');
```

```js
// ESM
import { getRadioChronCoreClient, streamStatus } from 'radiochron';
```

## Node API

```js
import { getRadioChronCoreClient } from 'radiochron';

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
const scan = await radiochron.ble.scan({ durationMs: 5_000 });
console.log(scan.discovery_mode, scan.advertisements, scan.system_devices);
await radiochron.ble.resetTracker({ persistent_unknown_ms: 60_000 });
const result = await radiochron.ble.observe(timedObservation);
const histories = await radiochron.ble.histories();
```

## Streaming

The streaming API uses cancelable async iterables, so it works with
`for await`, backpressure, and `AbortSignal` without buffering an unbounded
history in JavaScript:

```js
import { ble, chronicle, streamStatus } from 'radiochron';

const controller = new AbortController();

for await (const interfaces of streamStatus({
  intervalMs: 1_000,
  signal: controller.signal
})) {
  console.log(interfaces);
}

for await (const scan of ble.stream({
  durationMs: 4_000,
  intervalMs: 10_000,
  signal: controller.signal
})) {
  console.log(scan.advertisements);
}

for await (const entry of chronicle.stream({
  intervalMs: 1_000,
  includeExisting: false,
  signal: controller.signal
})) {
  console.log(entry.event_id, entry.kind);
}
```

`streamStatus()` yields current Wi-Fi snapshots. `ble.stream()` performs
bounded native scans and preserves the same process-local BLE tracker between
batches. `chronicle.stream()` tails unseen entries and deduplicates by
`event_id`; set `includeExisting: true` to emit the initial retained window.
Breaking the loop or aborting its signal stops further polling.

`radiochron/core` remains an equivalent explicit export for applications that
prefer it. The typed API covers status, scan, detailed BSS inventory, caveated
analysis, connection sampling, caller-targeted connectivity diagnosis, and the
change-only chronicle. The `ble` API can scan through native Windows
Bluetooth, Linux BlueZ or macOS CoreBluetooth and can also accept
advertisements from another Node BLE transport. It provides protocol-aware
identity, stateful history and caveated risk evidence. Scanning only starts
when `ble.scan()` is called.

`discovery_mode` reports how the platform performed that bounded scan. The
Windows collector currently uses active discovery to request scan-response
metadata, while macOS and Linux remain platform-managed. Active discovery runs
only for the requested scan window; it can improve names and service metadata,
but does not reveal connections between third-party devices.

CoreBluetooth assigns a peer UUID when macOS first encounters a peripheral, so
the native adapter uses that OS identity across private-address rotation.
Windows and Linux do not expose an equivalent identifier for arbitrary
unpaired advertisers: paired Windows devices can be correlated through the
system inventory, while anonymous private advertisements remain explicitly
ephemeral. Service UUIDs are reported when the device advertises them; the
scanner does not connect to unrelated devices to enumerate private GATT data.

On Windows, `ble.scan()` also returns `system_devices`: privacy-minimized
DeviceInformation records for OS-known Classic/BLE devices, including friendly
name, address, transport, paired/connected state, and device category when
Windows exposes it. This makes a connected mouse or headset visible even when
it emits no advertisement during the scan. Linux and macOS currently return
advertisement evidence without this desktop system-inventory enrichment.

`call()` remains available as a low-level escape hatch.

The adapter uses a private newline-delimited request protocol between Node and
the linked Rust process. Its hosted JSON codec is `blazingly-json`; the portable
`radiochron` core retains its no-std-compatible codec boundary. Native BLE
scanning uses `radiochron-native-ble` with direct WinRT, BlueZ D-Bus, and
CoreBluetooth backends. The bridge no longer depends on `btleplug`, Tokio, or
`futures`. The
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

An immutable version tag publishes through npm trusted publishing. The archive
is assembled from the five artifacts of one green CI run, `prepack` verifies
their identity/core revision/SHA-256, and `npm run verify:package` rejects Rust
`target/` output, missing platform binaries, or an unexpectedly large archive.
GitHub OIDC supplies a short-lived publishing identity; no npm credential is
stored in GitHub.

## Repository boundaries

- [`radiochron`](https://github.com/sergii-ziborov/radiochron) — Rust IoT core.
- [`radiochron-js`](https://github.com/sergii-ziborov/radiochron-js) — this
  Node/npm library over the core.
- [`radiochron-mcp`](https://github.com/sergii-ziborov/radiochron-mcp) — a
  separate pure-Rust MCP server.
- [`radiochron-agent`](https://github.com/sergii-ziborov/radiochron-agent) —
  unattended durable IoT/fleet collector.
- [`radiochron-electron`](https://github.com/sergii-ziborov/radiochron-electron)
  — a separate desktop application consuming `radiochron-js`.

Apple hosts use CoreWLAN, Linux uses nl80211, and Windows uses the native WLAN
API through the Rust core.

### Monitor mode is deliberately not exposed here

The core's `monitor` feature — radiotap and 802.11 frame analysis, measured
retry rate, deauthentication reason codes — is **not** surfaced by this library,
and that is a decision rather than an omission.

Capture requires elevated privilege (`CAP_NET_ADMIN` on Linux, root on macOS)
and disturbs the live link: on macOS the station interface itself switches mode,
so the machine loses its Wi-Fi connection for the duration of a capture. A Node
library that a desktop application embeds is precisely the wrong place for that.

Monitor mode is therefore available only where it can be operated responsibly:
in [`radiochron`](https://github.com/sergii-ziborov/radiochron) itself, for a
service that already runs privileged, and in
[`radiochron-esp-idf`](https://github.com/sergii-ziborov/radiochron/tree/main/adapters/esp-idf)
for firmware, which owns its radio outright. Nothing this library exposes needs
those privileges.

Licensed under the [MIT License](LICENSE-MIT). The underlying `radiochron`
Rust core remains separately dual-licensed under MIT or Apache-2.0.
