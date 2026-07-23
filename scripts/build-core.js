'use strict';

const { copyFileSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { basename, join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const manifest = resolve(__dirname, '..', 'native', 'radiochron-node-bridge', 'Cargo.toml');
const executable = process.platform === 'win32' ? 'radiochron-node-bridge.exe' : 'radiochron-node-bridge';
const outputDirectory = resolve(process.env.RADIOCHRON_CORE_OUTPUT_DIR || 'artifacts');
const result = spawnSync('cargo', ['build', '--locked', '--release', '--manifest-path', manifest], {
  cwd: resolve(__dirname, '..'),
  stdio: 'inherit',
  windowsHide: true
});
if (result.status !== 0) throw new Error(`cargo build failed with ${result.status}`);

const source = join(resolve(__dirname, '..'), 'native', 'radiochron-node-bridge', 'target', 'release', executable);
mkdirSync(outputDirectory, { recursive: true });
const destination = join(outputDirectory, basename(executable));
copyFileSync(source, destination);
const sha256 = createHash('sha256').update(readFileSync(destination)).digest('hex');
writeFileSync(`${destination}.build-info.json`, `${JSON.stringify({
  name: 'radiochron-node-bridge',
  version: '0.1.0',
  core_git_sha: 'c5c3b4c30b5395b2c8cbc459f4e85982e5fdbb4a',
  platform: process.platform,
  arch: process.arch,
  sha256
})}\n`);
