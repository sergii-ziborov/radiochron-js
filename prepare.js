'use strict';

/** Bundle and verify the native Node adapter for every supported target. */

const { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const packageJson = require('./package.json');

const expectedCore = packageJson.radiochronCore;
const targets = [
  { key: 'win32-x64', env: 'RADIOCHRON_CORE_BINARY_WIN32_X64', file: 'radiochron-node-bridge.exe', platform: 'win32' },
  { key: 'linux-x64', env: 'RADIOCHRON_CORE_BINARY_LINUX_X64', file: 'radiochron-node-bridge', platform: 'linux' },
  { key: 'darwin-x64', env: 'RADIOCHRON_CORE_BINARY_DARWIN_X64', file: 'radiochron-node-bridge', platform: 'darwin' },
  { key: 'darwin-arm64', env: 'RADIOCHRON_CORE_BINARY_DARWIN_ARM64', file: 'radiochron-node-bridge', platform: 'darwin' },
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: __dirname, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout.trim();
}

let dirty;
try {
  dirty = run('git', ['status', '--porcelain', '--untracked-files=all']);
} catch (error) {
  console.error(`prepare: cannot inspect package provenance: ${error.message}`);
  process.exit(1);
}
if (dirty) {
  console.error('prepare: working tree is not clean. Commit the exact package sources first.');
  process.exit(1);
}

for (const target of targets) {
  const configured = process.env[target.env];
  if (!configured) {
    console.error(`prepare: ${target.env} must point to the verified ${target.key} Node adapter`);
    process.exit(1);
  }
  const source = resolve(configured);
  const sidecar = `${source}.build-info.json`;
  try {
    if (!existsSync(source) || !existsSync(sidecar)) throw new Error('binary or build-info sidecar is missing');
    const buildInfo = JSON.parse(readFileSync(sidecar, 'utf8'));
    const digest = createHash('sha256').update(readFileSync(source)).digest('hex');
    if (
      buildInfo.sha256 !== digest ||
      buildInfo.name !== 'radiochron-node-bridge' ||
      buildInfo.core_git_sha !== expectedCore.gitSha
    ) {
      throw new Error('adapter identity, core revision, or SHA-256 mismatch');
    }
  } catch (error) {
    console.error(`prepare: cannot verify ${target.key} Node adapter: ${error.message}`);
    process.exit(1);
  }

  const destinationDirectory = join(__dirname, 'vendor-core', target.key);
  mkdirSync(destinationDirectory, { recursive: true });
  const destination = join(destinationDirectory, target.file);
  copyFileSync(source, destination);
  if (target.platform !== 'win32') chmodSync(destination, 0o755);
  const size = statSync(source).size;
  console.log(`prepare: bundled ${target.key} Node adapter (${Math.round(size / 1024)} KB, core ${expectedCore.gitSha.slice(0, 12)})`);
}
