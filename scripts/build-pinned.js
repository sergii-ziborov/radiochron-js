'use strict';

const { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const { basename, join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const packageJson = require('../package.json');

const key = process.env.RADIOCHRON_TARGET_KEY;
const binaryName = process.env.RADIOCHRON_BINARY_NAME;
const outputDirectory = resolve(process.env.RADIOCHRON_OUTPUT_DIR || 'artifacts');
if (!key || !binaryName) {
  throw new Error('RADIOCHRON_TARGET_KEY and RADIOCHRON_BINARY_NAME are required');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
  }
  return (result.stdout || '').trim();
}

const checkout = mkdtempSync(join(tmpdir(), 'radiochron-mcp-'));
run('git', ['clone', packageJson.radiochronMcp.repository, checkout]);
run('git', ['-C', checkout, 'checkout', '--detach', packageJson.radiochronMcp.gitSha]);
run('cargo', ['build', '--release', '--locked', '--manifest-path', join(checkout, 'Cargo.toml')], {
  env: { ...process.env, RADIOCHRON_GIT_SHA: packageJson.radiochronMcp.gitSha },
});

const source = join(checkout, 'target', 'release', binaryName);
const buildInfo = JSON.parse(run(source, ['--build-info'], { capture: true }));
if (
  buildInfo.git_sha !== packageJson.radiochronMcp.gitSha ||
  buildInfo.version !== packageJson.radiochronMcp.version
) {
  throw new Error(`built ${key} binary does not match the pinned MCP revision`);
}

mkdirSync(outputDirectory, { recursive: true });
const destination = join(outputDirectory, basename(binaryName));
copyFileSync(source, destination);
const sha256 = createHash('sha256').update(readFileSync(destination)).digest('hex');
writeFileSync(`${destination}.build-info.json`, `${JSON.stringify({ ...buildInfo, sha256 })}\n`);
