'use strict';

/**
 * Bundle a release binary from radiochron-mcp and prove that it is the exact
 * cross-repository revision declared in package.json.
 */

const { copyFileSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const packageJson = require('./package.json');

const expected = packageJson.radiochronMcp;
const source = resolve(
  process.env.RADIOCHRON_MCP_BINARY ||
    join(__dirname, '..', 'radiochron-mcp', 'target', 'release', 'radiochron.exe')
);
const target = join(__dirname, 'radiochron.exe');

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

let size;
let buildInfo;
let dirty;
try {
  size = statSync(source).size;
  buildInfo = JSON.parse(run(source, ['--build-info']));
  dirty = run('git', ['status', '--porcelain', '--untracked-files=all']);
} catch (error) {
  console.error(`prepare: cannot verify MCP binary provenance: ${error.message}`);
  process.exit(1);
}

if (dirty) {
  console.error('prepare: working tree is not clean. Commit the exact package sources first.');
  process.exit(1);
}
if (buildInfo.version !== packageJson.version || buildInfo.version !== expected.version) {
  console.error(
    `prepare: binary version ${buildInfo.version} does not match package/MCP version ${packageJson.version}/${expected.version}`
  );
  process.exit(1);
}
if (buildInfo.git_sha !== expected.gitSha) {
  console.error(
    `prepare: binary came from MCP ${buildInfo.git_sha}; package requires ${expected.gitSha}`
  );
  process.exit(1);
}

copyFileSync(source, target);
console.log(
  `prepare: bundled radiochron.exe (${Math.round(size / 1024)} KB, MCP ${expected.gitSha.slice(0, 12)})`
);
