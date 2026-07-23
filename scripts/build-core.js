'use strict';

const { copyFileSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { basename, join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const packageJson = require('../package.json');

const manifest = resolve(__dirname, '..', 'native', 'radiochron-node-bridge', 'Cargo.toml');
const manifestSource = readFileSync(manifest, 'utf8');
const bridgeVersion = manifestSource.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (!bridgeVersion) throw new Error(`cannot read bridge version from ${manifest}`);
const executable = process.platform === 'win32' ? 'radiochron-node-bridge.exe' : 'radiochron-node-bridge';
const outputDirectory = resolve(process.env.RADIOCHRON_CORE_OUTPUT_DIR || 'artifacts');
const cargoArgs = [
  ...(process.platform === 'win32' ? ['+stable-x86_64-pc-windows-msvc'] : []),
  'build',
  '--locked',
  '--release',
  '--manifest-path',
  manifest
];
const result = spawnSync('cargo', cargoArgs, {
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
  version: bridgeVersion,
  core_git_sha: packageJson.radiochronCore.gitSha,
  platform: process.platform,
  arch: process.arch,
  sha256
})}\n`);
