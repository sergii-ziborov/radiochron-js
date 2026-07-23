'use strict';

const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const packageJson = require('../package.json');

test('package metadata identifies the standalone Node library', () => {
  assert.equal(packageJson.name, 'radiochron');
  assert.equal(packageJson.bin, undefined);
  assert.equal(packageJson.repository.url, 'git+https://github.com/sergii-ziborov/radiochron-js.git');
});

test('package metadata binds one exact direct core revision', () => {
  assert.match(packageJson.radiochronCore.gitSha, /^[0-9a-f]{40}$/);
  assert.equal(packageJson.radiochronCore.version, '0.4.0');
});

test('all source-side package files exist', () => {
  for (const name of ['core.js', 'core.d.ts', 'prepare.js', 'scripts/build-core.js', 'native/radiochron-node-bridge/Cargo.toml', 'README.md', 'LICENSE-MIT']) {
    assert.equal(existsSync(join(__dirname, '..', name)), true, `${name} is missing`);
  }
});

test('package metadata covers Intel and Apple Silicon Macs plus Linux ARM64', () => {
  assert.match(packageJson.description, /cross-platform/i);
  assert(packageJson.keywords.includes('apple-silicon'));
  assert(packageJson.keywords.includes('linux-arm64'));
  assert(packageJson.files.includes('vendor-core'));
  assert(packageJson.files.includes('native/radiochron-node-bridge/src'));
  assert.equal(packageJson.files.includes('native'), false);
  assert.equal(packageJson.files.includes('vendor'), false);
});

test('native build provenance has one source of truth for the core revision', () => {
  const source = readFileSync(join(__dirname, '..', 'scripts', 'build-core.js'), 'utf8');
  assert.match(source, /packageJson\.radiochronCore\.gitSha/);
  assert.match(source, /manifestSource\.match/);
  assert.match(source, /stable-x86_64-pc-windows-msvc/);
  assert.doesNotMatch(source, /c5c3b4c30b5395b2c8cbc459f4e85982e5fdbb4a/);
});

test('only the standalone Node library is MIT licensed', () => {
  assert.equal(packageJson.license, 'MIT');
  assert.equal(packageJson.files.includes('LICENSE-MIT'), true);
  assert.equal(packageJson.files.includes('LICENSE-APACHE'), false);
});

test('public declarations expose Wi-Fi, connectivity, chronicle and BLE APIs', () => {
  const declarations = require('node:fs').readFileSync(join(__dirname, '..', 'core.d.ts'), 'utf8');
  for (const symbol of ['analyze(', 'sample(', 'diagnoseConnectivity(', 'RadioChronChronicleClient', 'RadioChronBleClient', 'RadioChronClockMetadata', 'clock: RadioChronClockMetadata']) {
    assert.match(declarations, new RegExp(symbol.replace('(', '\\(')));
  }
});
