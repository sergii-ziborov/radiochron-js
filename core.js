'use strict';

const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const DEFAULT_TIMEOUT_MS = 20_000;

function targetFor(platform = process.platform, arch = process.arch) {
  const supported = new Set(['win32-x64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64']);
  const key = `${platform}-${arch}`;
  if (!supported.has(key)) {
    throw new Error(`radiochron core: unsupported platform ${key}; supported: ${[...supported].join(', ')}`);
  }
  return {
    key,
    executable: platform === 'win32' ? 'radiochron-node-bridge.exe' : 'radiochron-node-bridge'
  };
}

function radiochronCoreManifestPath() {
  return join(__dirname, 'native', 'radiochron-node-bridge', 'Cargo.toml');
}

function resolveRadioChronCoreBridgePath(options = {}) {
  const configured = options.executablePath || process.env.RADIOCHRON_CORE_BRIDGE?.trim();
  if (configured) return configured;

  const target = targetFor();
  const candidates = [
    join(process.resourcesPath || '', 'native', target.executable),
    resolve(process.cwd(), 'native', 'bin', target.executable),
    join(__dirname, 'vendor-core', target.key, target.executable),
    join(__dirname, 'native', 'radiochron-node-bridge', 'target', 'release', target.executable)
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || target.executable;
}

class RadioChronCoreClient {
  constructor(options = {}) {
    this.executablePath = resolveRadioChronCoreBridgePath(options);
    this.child = null;
    this.pending = new Map();
    this.buffer = '';
    this.nextId = 1;
    this.chronicle = Object.freeze({
      start: (chronicleOptions = {}) => this.chronicleStart(chronicleOptions),
      stop: () => this.chronicleStop(),
      status: () => this.chronicleStatus(),
      recent: (chronicleOptions = {}) => this.chronicleRecent(chronicleOptions)
    });
    this.ble = Object.freeze({
      scan: (scanOptions = {}) => this.bleScan(scanOptions),
      identify: (advertisement, timeoutMs) => this.bleIdentify(advertisement, timeoutMs),
      resetTracker: (policy = {}, timeoutMs) => this.bleResetTracker(policy, timeoutMs),
      observe: (observation, timeoutMs) => this.bleObserve(observation, timeoutMs),
      histories: (timeoutMs) => this.bleHistories(timeoutMs),
      evaluate: (nowMs, timeoutMs) => this.bleEvaluate(nowMs, timeoutMs)
    });
  }

  call(method, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.start();
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`RadioChron core method ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  ping() {
    return this.call('ping');
  }

  status() {
    return this.call('wifi_status');
  }

  wifiStatus() {
    return this.status();
  }

  scan(timeoutMs = DEFAULT_TIMEOUT_MS) {
    return this.call('wifi_scan', {}, timeoutMs);
  }

  wifiScan(timeoutMs = DEFAULT_TIMEOUT_MS) {
    return this.scan(timeoutMs);
  }

  networks(options = {}) {
    return this.call('wifi_networks', compact({ refresh_scan: options.refreshScan }), options.timeoutMs);
  }

  wifiNetworks(options = {}) {
    return this.networks(options);
  }

  analyze(options = {}) {
    return this.call('wifi_analyze', compact({ refresh_scan: options.refreshScan }), options.timeoutMs);
  }

  sample(options = {}) {
    const durationSeconds = options.durationSeconds ?? 20;
    const timeoutMs = options.timeoutMs ?? Math.max(DEFAULT_TIMEOUT_MS, durationSeconds * 1000 + 10_000);
    return this.call('wifi_sample', compact({
      interface_guid: options.interfaceGuid,
      duration_seconds: options.durationSeconds,
      interval_ms: options.intervalMs
    }), timeoutMs);
  }

  diagnoseConnectivity(options = {}) {
    return this.call('connectivity_diagnose', compact({
      dns_name: options.dnsName,
      tcp_target: options.tcpTarget,
      internet_target: options.internetTarget,
      captive_portal_url: options.captivePortalUrl,
      captive_portal_expected_status: options.captivePortalExpectedStatus,
      tls_target: options.tlsTarget,
      quality_target: options.qualityTarget,
      quality_attempts: options.qualityAttempts,
      timeout_ms: options.probeTimeoutMs
    }), options.timeoutMs);
  }

  chronicleStart(options = {}) {
    return this.call('chronicle_start', compact({
      interval_seconds: options.intervalSeconds,
      signal_threshold_db: options.signalThresholdDb
    }), options.timeoutMs);
  }

  chronicleStop() {
    return this.call('chronicle_stop');
  }

  chronicleStatus() {
    return this.call('chronicle_status');
  }

  chronicleRecent(options = {}) {
    return this.call('chronicle_recent', compact({ max_entries: options.maxEntries }), options.timeoutMs);
  }

  bleIdentify(advertisement, timeoutMs) {
    return this.call('ble_identify', { advertisement }, timeoutMs);
  }

  bleScan(options = {}) {
    const durationMs = options.durationMs ?? 5_000;
    const timeoutMs = options.timeoutMs ?? Math.max(DEFAULT_TIMEOUT_MS, durationMs + 10_000);
    return this.call('ble_scan', compact({ duration_ms: options.durationMs }), timeoutMs);
  }

  bleResetTracker(policy = {}, timeoutMs) {
    return this.call('ble_tracker_reset', { policy }, timeoutMs);
  }

  bleObserve(observation, timeoutMs) {
    return this.call('ble_observe', { observation }, timeoutMs);
  }

  bleHistories(timeoutMs) {
    return this.call('ble_histories', {}, timeoutMs);
  }

  bleEvaluate(nowMs, timeoutMs) {
    return this.call('ble_evaluate', { now_ms: nowMs }, timeoutMs);
  }

  dispose() {
    const child = this.child;
    this.failAll(new Error('RadioChron core bridge disposed'));
    child?.kill();
    this.child = null;
  }

  start() {
    if (this.child) return;
    const child = spawn(this.executablePath, [], { windowsHide: true });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.consume(chunk));
    child.on('exit', (code) => this.failAll(new Error(`RadioChron core bridge exited with code ${code}`)));
    child.on('error', (error) => this.failAll(error));
  }

  consume(chunk) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf('\n');
      if (line) this.dispatch(line);
    }
  }

  dispatch(line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof response.id !== 'number') return;
    const request = this.pending.get(response.id);
    if (!request) return;
    clearTimeout(request.timer);
    this.pending.delete(response.id);
    if (response.error) request.reject(new Error(response.error));
    else request.resolve(response.result);
  }

  failAll(error) {
    for (const [, request] of this.pending) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.child = null;
  }
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

let shared = null;
function getRadioChronCoreClient() {
  shared ||= new RadioChronCoreClient();
  return shared;
}
function disposeRadioChronCoreClient() {
  shared?.dispose();
  shared = null;
}

const chronicle = Object.freeze({
  start: (options = {}) => getRadioChronCoreClient().chronicle.start(options),
  stop: () => getRadioChronCoreClient().chronicle.stop(),
  status: () => getRadioChronCoreClient().chronicle.status(),
  recent: (options = {}) => getRadioChronCoreClient().chronicle.recent(options)
});
const ble = Object.freeze({
  scan: (options = {}) => getRadioChronCoreClient().ble.scan(options),
  identify: (advertisement, timeoutMs) => getRadioChronCoreClient().ble.identify(advertisement, timeoutMs),
  resetTracker: (policy = {}, timeoutMs) => getRadioChronCoreClient().ble.resetTracker(policy, timeoutMs),
  observe: (observation, timeoutMs) => getRadioChronCoreClient().ble.observe(observation, timeoutMs),
  histories: (timeoutMs) => getRadioChronCoreClient().ble.histories(timeoutMs),
  evaluate: (nowMs, timeoutMs) => getRadioChronCoreClient().ble.evaluate(nowMs, timeoutMs)
});

module.exports = {
  RadioChronCoreClient,
  analyze: (options = {}) => getRadioChronCoreClient().analyze(options),
  ble,
  chronicle,
  diagnoseConnectivity: (options = {}) => getRadioChronCoreClient().diagnoseConnectivity(options),
  disposeRadioChronCoreClient,
  getRadioChronCoreClient,
  networks: (options = {}) => getRadioChronCoreClient().networks(options),
  ping: () => getRadioChronCoreClient().ping(),
  radiochronCoreManifestPath,
  resolveRadioChronCoreBridgePath,
  sample: (options = {}) => getRadioChronCoreClient().sample(options),
  scan: (timeoutMs) => getRadioChronCoreClient().scan(timeoutMs),
  status: () => getRadioChronCoreClient().status(),
  targetFor
};
