'use strict';

const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const core = require('../core');
const packageJson = require('../package.json');

const SUBPATHS = {
  wifi: ['analyze', 'diagnoseConnectivity', 'networks', 'sample', 'scan', 'status', 'streamStatus'],
  ble: ['evaluate', 'histories', 'identify', 'observe', 'resetTracker', 'scan', 'stream'],
  chronicle: ['recent', 'start', 'status', 'stop', 'stream']
};

/** Where the root export keeps each subpath's members. */
const ROOT_OF = {
  wifi: () => core,
  ble: () => core.ble,
  chronicle: () => core.chronicle
};

test('every subpath forwards the identical function object, not a copy', () => {
  for (const [name, members] of Object.entries(SUBPATHS)) {
    const subpath = require(`../${name}`);
    const root = ROOT_OF[name]();
    for (const member of members) {
      assert.equal(typeof subpath[member], 'function', `${name}.${member} must be callable`);
      assert.equal(
        subpath[member],
        root[member],
        `${name}.${member} must be the same function the root exports, so the bridge stays shared`
      );
    }
  }
});

test('subpaths expose exactly their declared members and nothing else', () => {
  for (const [name, members] of Object.entries(SUBPATHS)) {
    assert.deepEqual(Object.keys(require(`../${name}`)).sort(), [...members].sort(), name);
  }
});

test('the same good name means different calls on different subpaths', () => {
  const wifi = require('../wifi');
  const ble = require('../ble');
  const chronicle = require('../chronicle');
  assert.notEqual(wifi.scan, ble.scan, 'wifi scan and BLE scan must not be the same call');
  assert.notEqual(wifi.status, chronicle.status, 'association state is not recorder state');
});

test('ESM entrypoints export the same names as CommonJS', async () => {
  for (const [name, members] of Object.entries(SUBPATHS)) {
    const module = await import(`../${name}.mjs`);
    for (const member of members) {
      assert.equal(typeof module[member], 'function', `${name}.mjs must export ${member}`);
      assert.equal(module[member], require(`../${name}`)[member], `${name}.mjs ${member} must match CJS`);
    }
  }
});

test('every subpath is declared with types first and resolvable files', () => {
  for (const name of Object.keys(SUBPATHS)) {
    const entry = packageJson.exports[`./${name}`];
    assert(entry, `./${name} must be declared in exports`);
    assert.equal(
      Object.keys(entry)[0],
      'types',
      `./${name} must list "types" first or TypeScript ignores it`
    );
    assert.equal(entry.import, `./${name}.mjs`);
    assert.equal(entry.require, `./${name}.js`);
    for (const target of Object.values(entry)) {
      assert(existsSync(join(__dirname, '..', target)), `${target} is missing`);
    }
  }
});

test('every packed JavaScript and declaration file exists', () => {
  const shipped = packageJson.files.filter((name) => /\.(js|mjs|d\.ts)$/.test(name));
  for (const name of shipped) {
    assert(existsSync(join(__dirname, '..', name)), `${name} is listed in files but missing`);
  }
  for (const name of Object.keys(SUBPATHS)) {
    for (const extension of ['js', 'mjs', 'd.ts']) {
      assert(
        packageJson.files.includes(`${name}.${extension}`),
        `${name}.${extension} must be packed or the subpath breaks on install`
      );
    }
  }
});
