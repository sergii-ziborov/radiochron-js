'use strict';

const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const DEFAULT_TIMEOUT_MS = 20_000;

function targetFor(platform = process.platform, arch = process.arch) {
  const supported = new Set(['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64']);
  const key = `${platform}-${arch}`;
  if (!supported.has(key)) {
    throw new Error(`radiochron core: unsupported platform ${key}; supported: ${[...supported].join(', ')}`);
  }
  return {
    key,
    executable: platform === 'win32' ? 'radiochron-desktop-bridge.exe' : 'radiochron-desktop-bridge'
  };
}

function radiochronCoreManifestPath() {
  return join(__dirname, 'native', 'radiochron-desktop-bridge', 'Cargo.toml');
}

function resolveRadioChronCoreBridgePath(options = {}) {
  const configured = options.executablePath || process.env.RADIOCHRON_CORE_BRIDGE?.trim();
  if (configured) return configured;

  const target = targetFor();
  const candidates = [
    join(process.resourcesPath || '', 'native', target.executable),
    resolve(process.cwd(), 'native', 'bin', target.executable),
    join(__dirname, 'vendor-core', target.key, target.executable),
    join(__dirname, 'native', 'radiochron-desktop-bridge', 'target', 'release', target.executable)
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

let shared = null;
function getRadioChronCoreClient() {
  shared ||= new RadioChronCoreClient();
  return shared;
}
function disposeRadioChronCoreClient() {
  shared?.dispose();
  shared = null;
}

module.exports = {
  RadioChronCoreClient,
  disposeRadioChronCoreClient,
  getRadioChronCoreClient,
  radiochronCoreManifestPath,
  resolveRadioChronCoreBridgePath,
  targetFor
};
