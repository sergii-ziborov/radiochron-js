'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  radiochronCoreManifestPath,
  resolveRadioChronCoreBridgePath,
  targetFor
} = require('../core');

test('direct-core target selection covers Windows and both Mac architectures', () => {
  assert.deepEqual(targetFor('win32', 'x64'), {
    key: 'win32-x64',
    executable: 'radiochron-desktop-bridge.exe'
  });
  assert.equal(targetFor('darwin', 'x64').key, 'darwin-x64');
  assert.equal(targetFor('darwin', 'arm64').key, 'darwin-arm64');
});

test('an explicit direct-core bridge path wins', () => {
  assert.equal(resolveRadioChronCoreBridgePath({ executablePath: '/synthetic/core-bridge' }), '/synthetic/core-bridge');
  assert.match(radiochronCoreManifestPath(), /radiochron-desktop-bridge[\\/]Cargo\.toml$/);
});

test('unsupported architectures fail closed', () => {
  assert.throws(() => targetFor('darwin', 'ia32'), /unsupported platform/);
});
