# radiochron

The npm delivery package for [RadioChron](https://radiochron.com). It ships the
prebuilt Windows binary from
[`radiochron-mcp`](https://github.com/sergii-ziborov/radiochron-mcp), so an MCP
client needs Node.js but no Rust, Visual Studio, PowerShell, or .NET toolchain.

> Publication is pending. Until the package is published, build or install the
> MCP server directly from its repository.

```sh
claude mcp add radiochron -- npx -y radiochron
```

Or in any MCP client config:

```json
{ "mcpServers": { "radiochron": { "command": "npx", "args": ["-y", "radiochron"] } } }
```

The launcher exposes ten typed tools: six Wi-Fi diagnostics plus
`chronicle_start`, `chronicle_stop`, `chronicle_status`, and
`chronicle_recent`. Nothing reads saved passwords or sends telemetry.

## Provenance

`package.json` pins one exact `radiochron-mcp` commit. `prepack` reads the
binary's embedded `--build-info` and refuses to package a different version or
commit. CI independently checks this boundary on Node 18, 20, 22, and 24.

## Repository family

- [`radiochron`](https://github.com/sergii-ziborov/radiochron) — IoT/core Rust library
- [`radiochron-mcp`](https://github.com/sergii-ziborov/radiochron-mcp) — MCP server
- [`radiochron-site`](https://github.com/sergii-ziborov/radiochron-site) — website source

Windows-only today. Linux via nl80211 and macOS via CoreWLAN remain on the
[roadmap](https://radiochron.com/#roadmap).

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
