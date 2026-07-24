'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  RadioChronCoreClient,
  radiochronCoreManifestPath,
  resolveRadioChronCoreBridgePath,
  targetFor
} = require('../core');

test('direct-core target selection covers Windows, Linux ARM64, and both Mac architectures', () => {
  assert.deepEqual(targetFor('win32', 'x64'), {
    key: 'win32-x64',
    executable: 'radiochron-node-bridge.exe'
  });
  assert.equal(targetFor('linux', 'arm64').key, 'linux-arm64');
  assert.equal(targetFor('darwin', 'x64').key, 'darwin-x64');
  assert.equal(targetFor('darwin', 'arm64').key, 'darwin-arm64');
});

test('an explicit direct-core bridge path wins', () => {
  assert.equal(resolveRadioChronCoreBridgePath({ executablePath: '/synthetic/core-bridge' }), '/synthetic/core-bridge');
  assert.match(radiochronCoreManifestPath(), /radiochron-node-bridge[\\/]Cargo\.toml$/);
});

test('unsupported architectures fail closed', () => {
  assert.throws(() => targetFor('darwin', 'ia32'), /unsupported platform/);
});

test('typed API maps camelCase options onto the native bridge contract', async () => {
  const client = new RadioChronCoreClient({ executablePath: '/synthetic/core-bridge' });
  const calls = [];
  client.call = async (method, params, timeoutMs) => {
    calls.push({ method, params, timeoutMs });
    return { method };
  };

  await client.analyze({ refreshScan: true, timeoutMs: 12_000 });
  await client.sample({ interfaceGuid: 'wlan0', durationSeconds: 3, intervalMs: 500 });
  await client.diagnoseConnectivity({ dnsName: 'broker.lan', tcpTarget: 'broker.lan:1883', probeTimeoutMs: 800 });
  await client.chronicle.start({ intervalSeconds: 2, signalThresholdDb: 6 });
  await client.chronicle.recent({ maxEntries: 25 });
  await client.ble.identify({
    address: 'aa',
    address_type: 'random_static',
    rssi_dbm: -50
  });
  await client.ble.scan({ durationMs: 750, timeoutMs: 5_000 });
  await client.ble.evaluate(1_000);

  assert.deepEqual(calls[0], {
    method: 'wifi_analyze',
    params: { refresh_scan: true },
    timeoutMs: 12_000
  });
  assert.deepEqual(calls[1].params, {
    interface_guid: 'wlan0',
    duration_seconds: 3,
    interval_ms: 500
  });
  assert.equal(calls[1].timeoutMs, 20_000);
  assert.deepEqual(calls[2].params, {
    dns_name: 'broker.lan',
    tcp_target: 'broker.lan:1883',
    timeout_ms: 800
  });
  assert.deepEqual(calls[3].params, {
    interval_seconds: 2,
    signal_threshold_db: 6
  });
  assert.deepEqual(calls[4].params, { max_entries: 25 });
  assert.deepEqual(calls[5], {
    method: 'ble_identify',
    params: {
      advertisement: {
        address: 'aa',
        address_type: 'random_static',
        rssi_dbm: -50
      }
    },
    timeoutMs: undefined
  });
  assert.deepEqual(calls[6], {
    method: 'ble_scan',
    params: { duration_ms: 750 },
    timeoutMs: 5_000
  });
  assert.deepEqual(calls[7].params, { now_ms: 1_000 });
});

test('status and BLE streams are cancellable async iterables', async () => {
  const client = new RadioChronCoreClient({ executablePath: '/synthetic/core-bridge' });
  let statusCalls = 0;
  client.call = async (method) => {
    if (method === 'wifi_status') return [{ sequence: ++statusCalls }];
    if (method === 'ble_scan') return { advertisements: [{ sequence: 1 }] };
    throw new Error(`unexpected method ${method}`);
  };

  const statuses = [];
  for await (const snapshot of client.streamStatus({ intervalMs: 0 })) {
    statuses.push(snapshot);
    if (statuses.length === 2) break;
  }
  assert.deepEqual(statuses.map((snapshot) => snapshot[0].sequence), [1, 2]);

  const scans = [];
  for await (const snapshot of client.ble.stream({ durationMs: 25, intervalMs: 0 })) {
    scans.push(snapshot);
    break;
  }
  assert.equal(scans[0].advertisements.length, 1);
});

test('chronicle stream tails unseen event ids', async () => {
  const client = new RadioChronCoreClient({ executablePath: '/synthetic/core-bridge' });
  let reads = 0;
  client.call = async (method) => {
    assert.equal(method, 'chronicle_recent');
    reads += 1;
    return {
      entries: reads === 1
        ? [{ event_id: 'old' }]
        : [{ event_id: 'old' }, { event_id: 'new' }]
    };
  };

  const entries = [];
  for await (const entry of client.chronicle.stream({ intervalMs: 0 })) {
    entries.push(entry);
    break;
  }
  assert.deepEqual(entries, [{ event_id: 'new' }]);
});

test('ESM entrypoint exposes named APIs', async () => {
  const esm = await import('../core.mjs');
  assert.equal(esm.RadioChronCoreClient, RadioChronCoreClient);
  assert.equal(typeof esm.streamStatus, 'function');
});
