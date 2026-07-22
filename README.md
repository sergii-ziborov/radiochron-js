# radiochron

The JavaScript delivery package for [RadioChron](https://radiochron.com). It has
two deliberately separate surfaces:

- the `radiochron` command launches the portable
  [`radiochron-mcp`](https://github.com/sergii-ziborov/radiochron-mcp) server;
- `radiochron/core` is a programmatic Node API backed by a tiny native sidecar
  that links the [`radiochron`](https://github.com/sergii-ziborov/radiochron)
  Rust library directly. It does not start an MCP server or speak MCP/JSON-RPC.

Both surfaces cover Windows x64, Linux x64, Intel Mac and Apple Silicon Mac.

> Publication is pending. Until the package is published, use the repository
> source or build the corresponding Rust binary directly.

## MCP command

```sh
claude mcp add radiochron -- npx -y radiochron
```

Or in any MCP client config:

```json
{ "mcpServers": { "radiochron": { "command": "npx", "args": ["-y", "radiochron"] } } }
```

The MCP launcher exposes ten portable typed tools plus Windows event history.
`connectivity_diagnose` separates radio, authentication, DHCP/static IP,
gateway, DNS, TCP, captive portal, packet quality and Internet reachability.

## Direct Rust-core API

Desktop applications should import the programmatic surface:

```js
const { getRadioChronCoreClient } = require('radiochron/core');

const core = getRadioChronCoreClient();
const interfaces = await core.call('wifi_status');
const nearby = await core.call('wifi_networks');
```

The native bridge exposes only `ping`, `wifi_status`, `wifi_scan`, and
`wifi_networks`. That narrow protocol keeps UI integration out of the MCP
server while reusing the same Rust collectors and data model. The
[RadioChron Desktop](https://github.com/sergii-ziborov/radiochron-electron)
application consumes this API and embeds the platform bridge in its installer.

## Provenance

`package.json` pins one exact `radiochron-mcp` commit and one exact core commit.
`prepack` verifies the identity and SHA-256 of every MCP and direct-core binary
before it can enter the npm archive. CI builds all four platform/architecture
variants and checks the JavaScript surface on Node 18, 20, 22, and 24.

## Repository family

- [`radiochron`](https://github.com/sergii-ziborov/radiochron) — IoT/core Rust library
- [`radiochron-agent`](https://github.com/sergii-ziborov/radiochron-agent) — offline-first fleet daemon and exporters
- [`radiochron-fleet`](https://github.com/sergii-ziborov/radiochron-fleet) — self-hosted fleet control plane
- [`radiochron-mcp`](https://github.com/sergii-ziborov/radiochron-mcp) — MCP server
- [`radiochron-electron`](https://github.com/sergii-ziborov/radiochron-electron) — Windows/macOS desktop UI
- [`radiochron-site`](https://github.com/sergii-ziborov/radiochron-site) — website source

Apple hosts use CoreWLAN; Linux uses nl80211; Windows uses the native WLAN API.
WLAN AutoConfig history is Windows-only, while direct status/scans, portable
MCP tools and the local chronicle are available across supported platforms.

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
