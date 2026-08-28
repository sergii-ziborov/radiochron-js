'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { run, parseFlags, resolveCommand, HELP, SPEC } = require('../cli');
const render = require('../cli-render');

/** Records every call so a test can assert what reached the bridge. */
function fakeClient(results = {}) {
  const calls = [];
  const record = (name, reply) => (...args) => {
    calls.push({ name, args });
    return Promise.resolve(results[name] ?? reply ?? {});
  };
  return {
    calls,
    ping: record('ping', { ok: true }),
    status: record('status', { interfaces: [] }),
    scan: record('scan'),
    networks: record('networks', { networks: [] }),
    analyze: record('analyze', { analysis: { bss_count: 0, bands: [], findings: [] } }),
    sample: record('sample'),
    diagnoseConnectivity: record('diagnoseConnectivity'),
    ble: {
      scan: record('ble.scan'),
      histories: record('ble.histories'),
      identify: record('ble.identify')
    },
    chronicle: {
      recent: record('chronicle.recent', { entries: [] }),
      status: record('chronicle.status')
    }
  };
}

/** Collect stdout/stderr instead of writing them. */
function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { out: (text) => out.push(text), err: (text) => err.push(text) } };
}

async function invoke(argv, client = fakeClient()) {
  const sink = capture();
  const code = await run(argv, { ...sink.io, client });
  return { code, out: sink.out.join('\n'), err: sink.err.join('\n'), client };
}

test('help and version answer without touching the bridge', async () => {
  for (const argv of [[], ['--help'], ['-h'], ['help']]) {
    const { code, out } = await invoke(argv);
    assert.equal(code, 0);
    assert.match(out, /USAGE/);
  }
  const { code, out } = await invoke(['--version']);
  assert.equal(code, 0);
  assert.match(out, /^radiochron-js \d+\.\d+\.\d+$/);
});

test('help documents every command the router accepts', () => {
  for (const command of Object.keys(SPEC)) {
    assert(HELP.includes(command), `${command} is missing from --help`);
  }
  assert(HELP.includes('location data'), 'the privacy note must survive');
});

test('unknown commands, subcommands and flags fail loudly', async () => {
  const cases = [
    [['teleport'], /unknown command/],
    [['ble'], /needs a subcommand/],
    [['ble', 'sniff'], /unknown ble subcommand/],
    [['networks', '--refersh'], /unknown flag/],
    [['status', '--refresh'], /unknown flag/],
    [['sample', '--duration'], /needs a value/],
    [['sample', '--duration', 'soon'], /must be a number/]
  ];
  for (const [argv, expected] of cases) {
    const { code, err } = await invoke(argv);
    assert.equal(code, 1, `${argv.join(' ')} should fail`);
    assert.match(err, expected);
  }
});

test('flags reach the library under its own option names', async () => {
  const { client } = await invoke(['networks', '--refresh']);
  assert.deepEqual(client.calls[0], { name: 'networks', args: [{ refreshScan: true }] });

  const ble = await invoke(['ble', 'scan', '--duration', '3000']);
  assert.deepEqual(ble.client.calls[0], { name: 'ble.scan', args: [{ durationMs: 3000 }] });

  const chronicle = await invoke(['chronicle', 'recent', '--max=5']);
  assert.deepEqual(chronicle.client.calls[0], { name: 'chronicle.recent', args: [{ maxEntries: 5 }] });

  const connectivity = await invoke([
    'connectivity', '--dns', 'example.com', '--attempts', '3', '--probe-timeout', '1500'
  ]);
  const [options] = connectivity.client.calls[0].args;
  assert.equal(options.dnsName, 'example.com');
  assert.equal(options.qualityAttempts, 3);
  assert.equal(options.probeTimeoutMs, 1500);
  assert.equal(options.tlsTarget, undefined);
});

test('--json prints the raw result and text mode renders it', async () => {
  const results = {
    status: {
      interfaces: [
        {
          interface: { description: 'Intel AX211', state: 'connected' },
          connection: { ssid: 'home', bssid: 'aa:bb', phy_type: 'he', signal_quality: 78, rssi_dbm_estimate: -61, rx_rate_kbps: 1, tx_rate_kbps: 2 }
        }
      ]
    }
  };
  const json = await invoke(['status', '--json'], fakeClient(results));
  assert.deepEqual(JSON.parse(json.out), results.status);

  const text = await invoke(['status'], fakeClient(results));
  assert.match(text.out, /Intel AX211/);
  assert.match(text.out, /78\/100/);
  assert.doesNotMatch(text.out, /interfaces/);
});

test('ble identify refuses a missing or malformed advertisement', async () => {
  const missing = await invoke(['ble', 'identify']);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /--advertisement/);

  const malformed = await invoke(['ble', 'identify', '--advertisement', '{oops']);
  assert.equal(malformed.code, 1);
  assert.match(malformed.err, /valid JSON/);

  const good = await invoke(['ble', 'identify', '--advertisement', '{"address":"aa"}']);
  assert.equal(good.code, 0);
  assert.deepEqual(good.client.calls[0].args, [{ address: 'aa' }]);
});

test('a rejected call becomes an exit code, not a stack trace', async () => {
  const client = fakeClient();
  client.status = () => Promise.reject(new Error('bridge is missing'));
  const { code, err } = await invoke(['status'], client);
  assert.equal(code, 1);
  assert.equal(err, 'Error: bridge is missing');
});

test('parseFlags accepts both spellings and rejects repeats', () => {
  const flags = parseFlags(['--max', '12', '--refresh'], ['max'], ['refresh']);
  assert.equal(flags.number('max'), 12);
  assert.equal(flags.on('refresh'), true);
  assert.equal(flags.text('missing'), undefined);

  assert.throws(() => parseFlags(['--max=1', '--max=2'], ['max'], []), /twice/);
  assert.throws(() => parseFlags(['--refresh=yes'], [], ['refresh']), /takes no value/);
  assert.throws(() => parseFlags(['scan'], [], []), /unexpected argument/);
});

test('resolveCommand joins subcommands and passes the rest through', () => {
  assert.deepEqual(resolveCommand(['ble', 'scan', '--duration', '5']), {
    command: 'ble scan',
    rest: ['--duration', '5']
  });
  assert.deepEqual(resolveCommand(['status']), { command: 'status', rest: [] });
});

test('networks render sorts strongest first and marks hidden SSIDs', () => {
  const text = render.networks({
    cache_age_seconds: 4,
    networks: [
      { ssid: null, bssid: 'a', band: '2.4GHz', channel: 6, rssi_dbm: -80, security: 'open' },
      { ssid: 'near', bssid: 'b', band: '5GHz', channel: 36, rssi_dbm: -40, security: 'rsn' }
    ]
  });
  assert(text.indexOf('near') < text.indexOf('<hidden>'), 'strongest BSS sorts first');
  assert.match(text, /scan cache 4s old/);
  assert.match(text, /location data/);
});

test('status renders both the bridge array and the MCP envelope', () => {
  const entry = {
    interface: { description: 'Intel AX211', state: 'connected' },
    connection: { ssid: 'home', bssid: 'aa', phy_type: 'he', signal_quality: 78, rssi_dbm_estimate: -61, rx_rate_kbps: 1, tx_rate_kbps: 2 }
  };
  assert.equal(render.status([entry]), render.status({ interfaces: [entry] }));
  assert.match(render.status([entry]), /Intel AX211/);
  assert.match(render.status([{ interface: { description: 'x', state: 'disconnected' }, connection: null }]), /not associated/);
  assert.match(render.status([]), /No WLAN interfaces/);
});

test('security is read off the IE flags, never reclassified here', () => {
  assert.equal(render.security({ security: 'wpa3-personal' }), 'wpa3-personal');
  assert.equal(render.security({ information_elements: { has_rsn: true } }), 'rsn');
  assert.equal(render.security({ information_elements: { has_rsn: false, has_wpa: true } }), 'wpa');
  assert.equal(render.security({ information_elements: { has_rsn: false, has_wpa: false } }), 'open');
  assert.equal(render.security({}), '-');
});

test('interface errors are surfaced rather than swallowed', () => {
  const text = render.networks({ networks: [], interface_errors: [{ interface_guid: 'g', error_code: 5 }] });
  assert.match(text, /1 interface\(s\) failed/);
  assert.match(text, /error_code/);
});

test('analyze states the quiet case and lists findings with their caveat', () => {
  assert.match(render.analyze({ analysis: { bss_count: 3, bands: [], findings: [] } }), /none/);
  const text = render.analyze({
    analysis: {
      bss_count: 1,
      bands: [],
      findings: [{ severity: 'warning', title: 'Crowded channel', caveat: 'beacons only' }]
    }
  });
  assert.match(text, /\[warning\] Crowded channel/);
  assert.match(text, /beacons only/);
});

test('table columns pad to the widest cell, counting characters not bytes', () => {
  const lines = render.table(['SSID', 'CH'], [['кафе', '6'], ['a', '11']]).split('\n');
  assert.equal(lines[0], 'SSID  CH');
  assert.equal(lines[1], 'кафе  6');
  assert.equal(lines[2], 'a     11');
});
