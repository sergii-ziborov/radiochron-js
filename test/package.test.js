'use strict';

const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
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
  assert.equal(packageJson.radiochronCore.version, '0.2.0');
});

test('all source-side package files exist', () => {
  for (const name of ['core.js', 'core.d.ts', 'prepare.js', 'scripts/build-core.js', 'native/radiochron-node-bridge/Cargo.toml', 'README.md', 'LICENSE-MIT', 'LICENSE-APACHE']) {
    assert.equal(existsSync(join(__dirname, '..', name)), true, `${name} is missing`);
  }
});

test('package metadata covers Intel and Apple Silicon Macs', () => {
  assert.match(packageJson.description, /cross-platform/i);
  assert(packageJson.keywords.includes('apple-silicon'));
  assert(packageJson.files.includes('vendor-core'));
  assert.equal(packageJson.files.includes('vendor'), false);
});
