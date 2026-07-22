#!/usr/bin/env node
'use strict';

/** RadioChron MCP native-binary launcher. */

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const targets = {
  'win32-x64': ['win32-x64', 'radiochron.exe'],
  'linux-x64': ['linux-x64', 'radiochron'],
  'darwin-x64': ['darwin-x64', 'radiochron'],
  'darwin-arm64': ['darwin-arm64', 'radiochron'],
};
const key = `${process.platform}-${process.arch}`;
const target = targets[key];

if (!target) {
  process.stderr.write(
    `radiochron: unsupported platform ${key}; supported: ${Object.keys(targets).join(', ')}\n`
  );
  process.exit(1);
}

const executable = join(__dirname, 'vendor', target[0], target[1]);
if (!existsSync(executable)) {
  process.stderr.write(`radiochron: bundled ${key} engine is missing — reinstall the package.\n`);
  process.exit(1);
}

const result = spawnSync(executable, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) {
  process.stderr.write(`radiochron: could not start ${key} engine: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
