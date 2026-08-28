#!/usr/bin/env node
'use strict';

// The command line for the Node package.
//
// It is deliberately NOT installed as `radiochron`: the `radiochron-mcp`
// package already owns that command, and two packages claiming one binary
// resolve by install order and break silently. This one installs as
// `radiochron-js` and covers what the Node bridge exposes.
//
// What it adds over the Rust CLI is `watch`: the streaming API in this package
// has no equivalent there, and live output is the reason to reach for Node.

const core = require('./core');

const HELP = `radiochron-js — Wi-Fi and Bluetooth LE diagnostics for Node

USAGE
  radiochron-js <command> [flags]

WI-FI
  status                          association state of every adapter
  scan                            ask the driver to look again
  networks [--refresh]            visible networks
  analyze [--refresh]             findings about the environment
  sample [--duration S] [--interval MS] [--interface GUID]
                                  track signal over a window

CONNECTIVITY
  connectivity [--dns NAME] [--tcp HOST:PORT] [--internet URL]
               [--captive-portal URL] [--captive-status CODE] [--tls HOST:PORT]
               [--quality HOST:PORT] [--attempts N] [--probe-timeout MS]

BLUETOOTH LE
  ble scan [--duration MS]        native BLE scan
  ble histories                   identities observed so far
  ble identify --advertisement '<json>'

CHRONICLE
  chronicle recent [--max N]      recent entries
  chronicle status                recorder state
  chronicle record [--interval S] [--threshold DB]
                                  record in the foreground until you stop it

WATCH  (streaming — unique to this package)
  watch status [--interval MS]    association state as it changes
  watch chronicle [--interval MS] [--max N] [--existing]
                                  new journal entries as they land
  watch ble [--duration MS] [--interval MS]
                                  repeated BLE scans

OTHER
  ping                            check the native bridge answers
  --json                          raw JSON instead of text (one-shot commands)
  --version  --help

A Wi-Fi scan lists neighbouring SSIDs and BSSIDs, and a BSSID resolves to a street
address through public geolocation databases. Treat the output as location data.
`;

/** Flags a command accepts, as [valueFlags, switchFlags]. */
const SPEC = {
  ping: [[], []],
  status: [[], []],
  scan: [[], []],
  networks: [[], ['refresh']],
  analyze: [[], ['refresh']],
  sample: [['duration', 'interval', 'interface'], []],
  connectivity: [
    ['dns', 'tcp', 'internet', 'captive-portal', 'captive-status', 'tls', 'quality', 'attempts', 'probe-timeout'],
    []
  ],
  'ble scan': [['duration'], []],
  'ble histories': [[], []],
  'ble identify': [['advertisement'], []],
  'chronicle recent': [['max'], []],
  'chronicle status': [[], []],
  'chronicle record': [['interval', 'threshold'], []],
  'watch status': [['interval'], []],
  'watch chronicle': [['interval', 'max'], ['existing']],
  'watch ble': [['duration', 'interval'], []]
};

const SUBCOMMANDS = {
  ble: ['scan', 'histories', 'identify'],
  chronicle: ['recent', 'status', 'record'],
  watch: ['status', 'chronicle', 'ble']
};

/**
 * Parse flags, refusing anything not declared.
 *
 * A mistyped `--durations` must fail rather than silently fall back to a
 * default, which is the same contract the Rust CLI and the MCP tools apply.
 */
function parseFlags(tokens, valueFlags, switchFlags) {
  const values = new Map();
  const switches = new Set();
  const accepted = () => {
    const names = [...valueFlags.map((name) => `--${name} <value>`), ...switchFlags.map((name) => `--${name}`)].sort();
    return names.length ? `; accepted here: ${names.join(', ')}` : '; this command takes no flags';
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}${accepted()}`);
    const body = token.slice(2);
    const equals = body.indexOf('=');

    if (equals >= 0) {
      const name = body.slice(0, equals);
      if (switchFlags.includes(name)) throw new Error(`--${name} is a switch and takes no value`);
      if (!valueFlags.includes(name)) throw new Error(`unknown flag: --${name}${accepted()}`);
      if (values.has(name)) throw new Error(`--${name} was given twice`);
      values.set(name, body.slice(equals + 1));
      continue;
    }

    if (valueFlags.includes(body)) {
      const value = tokens[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`--${body} needs a value`);
      if (values.has(body)) throw new Error(`--${body} was given twice`);
      values.set(body, value);
      index += 1;
      continue;
    }

    if (switchFlags.includes(body)) {
      switches.add(body);
      continue;
    }
    throw new Error(`unknown flag: --${body}${accepted()}`);
  }

  return {
    text: (name) => values.get(name),
    number: (name) => {
      if (!values.has(name)) return undefined;
      const raw = values.get(name);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number, got ${raw}`);
      return parsed;
    },
    on: (name) => switches.has(name)
  };
}

function connectivityOptions(flags) {
  return {
    dnsName: flags.text('dns'),
    tcpTarget: flags.text('tcp'),
    internetTarget: flags.text('internet'),
    captivePortalUrl: flags.text('captive-portal'),
    captivePortalExpectedStatus: flags.number('captive-status'),
    tlsTarget: flags.text('tls'),
    qualityTarget: flags.text('quality'),
    qualityAttempts: flags.number('attempts'),
    probeTimeoutMs: flags.number('probe-timeout')
  };
}

/** One-shot commands: name -> (flags, client) => Promise<result>. */
const ONE_SHOT = {
  ping: (_flags, client) => client.ping(),
  status: (_flags, client) => client.status(),
  scan: (_flags, client) => client.scan(),
  networks: (flags, client) => client.networks({ refreshScan: flags.on('refresh') }),
  analyze: (flags, client) => client.analyze({ refreshScan: flags.on('refresh') }),
  sample: (flags, client) =>
    client.sample({
      durationSeconds: flags.number('duration'),
      intervalMs: flags.number('interval'),
      interfaceGuid: flags.text('interface')
    }),
  connectivity: (flags, client) => client.diagnoseConnectivity(connectivityOptions(flags)),
  'ble scan': (flags, client) => client.ble.scan({ durationMs: flags.number('duration') }),
  'ble histories': (_flags, client) => client.ble.histories(),
  'ble identify': (flags, client) => {
    const raw = flags.text('advertisement');
    if (raw === undefined) throw new Error("ble identify needs --advertisement '<json>'");
    let advertisement;
    try {
      advertisement = JSON.parse(raw);
    } catch (error) {
      throw new Error(`--advertisement must be valid JSON: ${error.message}`);
    }
    return client.ble.identify(advertisement);
  },
  'chronicle recent': (flags, client) => client.chronicle.recent({ maxEntries: flags.number('max') }),
  'chronicle status': (_flags, client) => client.chronicle.status()
};

/** Streaming commands: name -> (flags, client, signal) => AsyncIterable. */
const STREAMS = {
  'watch status': (flags, client, signal) => client.streamStatus({ intervalMs: flags.number('interval') ?? 2000, signal }),
  'watch chronicle': (flags, client, signal) =>
    client.streamChronicle({
      intervalMs: flags.number('interval') ?? 2000,
      maxEntries: flags.number('max'),
      includeExisting: flags.on('existing'),
      signal
    }),
  'watch ble': (flags, client, signal) =>
    client.streamBle({ durationMs: flags.number('duration'), intervalMs: flags.number('interval') ?? 0, signal })
};

function resolveCommand(tokens) {
  const [first, second] = tokens;
  if (!SUBCOMMANDS[first]) return { command: first, rest: tokens.slice(1) };
  const valid = SUBCOMMANDS[first];
  if (second === undefined) throw new Error(`${first} needs a subcommand: ${valid.join(', ')}`);
  if (!valid.includes(second)) {
    throw new Error(`unknown ${first} subcommand: ${second}\nExpected one of: ${valid.join(', ')}`);
  }
  return { command: `${first} ${second}`, rest: tokens.slice(2) };
}

async function run(argv, io = {}) {
  const out = io.out ?? ((text) => process.stdout.write(`${text}\n`));
  const err = io.err ?? ((text) => process.stderr.write(`${text}\n`));
  const render = io.render ?? require('./cli-render');

  const tokens = argv.filter((token) => token !== '--json');
  const asJson = tokens.length !== argv.length;

  if (tokens.length === 0 || tokens[0] === '--help' || tokens[0] === '-h' || tokens[0] === 'help') {
    out(HELP.trimEnd());
    return 0;
  }
  if (tokens[0] === '--version' || tokens[0] === '-V') {
    out(`radiochron-js ${require('./package.json').version}`);
    return 0;
  }

  let command;
  let rest;
  try {
    ({ command, rest } = resolveCommand(tokens));
  } catch (error) {
    err(`Error: ${error.message}`);
    return 1;
  }

  const spec = SPEC[command];
  if (!spec) {
    err(`Error: unknown command: ${command}\nRun radiochron-js --help for the list.`);
    return 1;
  }

  const client = io.client ?? core.getRadioChronCoreClient();
  try {
    const flags = parseFlags(rest, spec[0], spec[1]);
    if (STREAMS[command]) {
      await stream(command, flags, client, out, err);
      return 0;
    }
    if (command === 'chronicle record') {
      await record(flags, client, out, err);
      return 0;
    }
    const result = await ONE_SHOT[command](flags, client);
    out(asJson ? JSON.stringify(result, null, 2) : render.emit(command, result));
    return 0;
  } catch (error) {
    err(`Error: ${error.message}`);
    return 1;
  } finally {
    if (!io.client) core.disposeRadioChronCoreClient();
  }
}

/**
 * Stream until interrupted. Each item is one JSON line so the output composes
 * with `jq` and friends rather than needing a parser of its own.
 */
async function stream(command, flags, client, out, err) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  err(`Watching (${command}) — Ctrl-C to stop.`);
  try {
    for await (const item of STREAMS[command](flags, client, controller.signal)) {
      out(JSON.stringify(item));
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

/**
 * Start the recorder and hold the process open.
 *
 * The bridge dies with this process, so a one-shot `chronicle start` would stop
 * recording the instant it returned. Keeping it in the foreground is the honest
 * shape for a CLI, and it stops the recorder cleanly on the way out.
 */
async function record(flags, client, out, err) {
  const started = await client.chronicle.start({
    intervalSeconds: flags.number('interval'),
    signalThresholdDb: flags.number('threshold')
  });
  err(`Recording to ${started.path ?? 'the chronicle'} — Ctrl-C to stop.`);

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    for await (const entry of client.chronicle.stream({
      intervalMs: 2000,
      signal: controller.signal
    })) {
      out(JSON.stringify(entry));
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await client.chronicle.stop().catch(() => {});
  }
}

module.exports = { run, parseFlags, resolveCommand, HELP, SPEC, SUBCOMMANDS };

if (require.main === module) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`radiochron-js: ${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    }
  );
}
