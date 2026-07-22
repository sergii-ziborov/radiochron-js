'use strict';

/** Bundle four native targets and verify each against the pinned MCP commit. */

const { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const packageJson = require('./package.json');

const expected = packageJson.radiochronMcp;
const expectedCore = packageJson.radiochronCore;
const targets = [
  { key: 'win32-x64', env: 'RADIOCHRON_MCP_BINARY_WIN32_X64', file: 'radiochron.exe', platform: 'win32', arch: 'x64' },
  { key: 'linux-x64', env: 'RADIOCHRON_MCP_BINARY_LINUX_X64', file: 'radiochron', platform: 'linux', arch: 'x64' },
  { key: 'darwin-x64', env: 'RADIOCHRON_MCP_BINARY_DARWIN_X64', file: 'radiochron', platform: 'darwin', arch: 'x64' },
  { key: 'darwin-arm64', env: 'RADIOCHRON_MCP_BINARY_DARWIN_ARM64', file: 'radiochron', platform: 'darwin', arch: 'arm64' },
];
const coreTargets = targets.map((target) => ({
  ...target,
  env: target.env.replace('RADIOCHRON_MCP_BINARY', 'RADIOCHRON_CORE_BINARY'),
  file: target.platform === 'win32' ? 'radiochron-desktop-bridge.exe' : 'radiochron-desktop-bridge',
}));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: __dirname,
    encoding: 'utf8',
    windowsHide: true,
  });
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
    console.error(`prepare: ${target.env} must point to the verified ${target.key} binary`);
    process.exit(1);
  }
  const source = resolve(configured);
  const sidecar = `${source}.build-info.json`;
  let buildInfo;
  try {
    if (existsSync(sidecar)) {
      buildInfo = JSON.parse(readFileSync(sidecar, 'utf8'));
      const digest = createHash('sha256').update(readFileSync(source)).digest('hex');
      if (buildInfo.sha256 !== digest) {
        throw new Error('binary SHA-256 does not match its native build sidecar');
      }
    } else if (process.platform === target.platform && process.arch === target.arch) {
      buildInfo = JSON.parse(run(source, ['--build-info']));
    } else {
      throw new Error(`foreign binary requires ${sidecar}`);
    }
  } catch (error) {
    console.error(`prepare: cannot verify ${target.key} provenance: ${error.message}`);
    process.exit(1);
  }
  if (
    buildInfo.name !== 'radiochron' ||
    buildInfo.version !== packageJson.version ||
    buildInfo.version !== expected.version
  ) {
    console.error(`prepare: ${target.key} identity/version does not match package ${packageJson.version}`);
    process.exit(1);
  }
  if (buildInfo.git_sha !== expected.gitSha) {
    console.error(`prepare: ${target.key} came from MCP ${buildInfo.git_sha}; package requires ${expected.gitSha}`);
    process.exit(1);
  }

  const destinationDirectory = join(__dirname, 'vendor', target.key);
  mkdirSync(destinationDirectory, { recursive: true });
  const destination = join(destinationDirectory, target.file);
  copyFileSync(source, destination);
  if (target.platform !== 'win32') chmodSync(destination, 0o755);
  const size = statSync(source).size;
  console.log(
    `prepare: bundled ${target.key} (${Math.round(size / 1024)} KB, MCP ${expected.gitSha.slice(0, 12)})`
  );
}

for (const target of coreTargets) {
  const configured = process.env[target.env];
  if (!configured) {
    console.error(`prepare: ${target.env} must point to the verified ${target.key} direct-core bridge`);
    process.exit(1);
  }
  const source = resolve(configured);
  const sidecar = `${source}.build-info.json`;
  try {
    const buildInfo = JSON.parse(readFileSync(sidecar, 'utf8'));
    const digest = createHash('sha256').update(readFileSync(source)).digest('hex');
    if (
      buildInfo.sha256 !== digest ||
      buildInfo.name !== 'radiochron-desktop-bridge' ||
      buildInfo.core_git_sha !== expectedCore.gitSha
    ) {
      throw new Error('direct-core identity, revision, or SHA-256 mismatch');
    }
  } catch (error) {
    console.error(`prepare: cannot verify ${target.key} direct-core bridge: ${error.message}`);
    process.exit(1);
  }

  const destinationDirectory = join(__dirname, 'vendor-core', target.key);
  mkdirSync(destinationDirectory, { recursive: true });
  const destination = join(destinationDirectory, target.file);
  copyFileSync(source, destination);
  if (target.platform !== 'win32') chmodSync(destination, 0o755);
  const size = statSync(source).size;
  console.log(`prepare: bundled direct-core ${target.key} (${Math.round(size / 1024)} KB, core ${expectedCore.gitSha.slice(0, 12)})`);
}
