# radiochron-js

The official Node.js/npm API for the
[`radiochron`](https://github.com/sergii-ziborov/radiochron) Rust Wi-Fi
diagnostics core for applications and services.

It supports Windows x64, Linux x64, Intel Mac, and Apple Silicon Mac. The npm
archive carries a small native adapter linked directly to the pinned Rust core;
JavaScript applications never need to parse platform commands themselves.

> Publication is pending. Until the package is published, install it from this
> repository or use a local checkout.

## Node API

```js
const { getRadioChronCoreClient } = require('radiochron');

const radiochron = getRadioChronCoreClient();
const interfaces = await radiochron.call('wifi_status');
const nearby = await radiochron.call('wifi_networks');
```

`radiochron/core` remains an equivalent explicit export for applications that
prefer it. The current native surface provides `ping`, `wifi_status`,
`wifi_scan`, and `wifi_networks`.

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
CI builds Windows x64, Linux x64, Intel Mac, and Apple Silicon variants and
checks the JavaScript API on supported Node versions.

## Repository boundaries

- [`radiochron`](https://github.com/sergii-ziborov/radiochron) — Rust IoT core.
- [`radiochron-js`](https://github.com/sergii-ziborov/radiochron-js) — this
  Node/npm library over the core.
- [`radiochron-electron`](https://github.com/sergii-ziborov/radiochron-electron)
  — a separate desktop application consuming `radiochron-js`.

Apple hosts use CoreWLAN, Linux uses nl80211, and Windows uses the native WLAN
API through the Rust core.

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
