'use strict';

const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const packageJson = require('../package.json');

test('package metadata binds one exact MCP revision', () => {
  assert.match(packageJson.radiochronMcp.gitSha, /^[0-9a-f]{40}$/);
  assert.equal(packageJson.radiochronMcp.version, packageJson.version);
  assert.equal(packageJson.repository.url, 'git+https://github.com/sergii-ziborov/radiochron-js.git');
});

test('all source-side package files exist', () => {
  for (const name of ['bin.js', 'prepare.js', 'README.md', 'LICENSE-MIT', 'LICENSE-APACHE']) {
    assert.equal(existsSync(join(__dirname, '..', name)), true, `${name} is missing`);
  }
});
