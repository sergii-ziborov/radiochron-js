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
  assert.deepEqual(calls[6].params, { now_ms: 1_000 });
});
