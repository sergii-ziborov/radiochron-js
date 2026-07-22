'use strict';

const { spawnSync } = require('node:child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: require('node:path').resolve(__dirname, '..'),
  encoding: 'utf8',
  windowsHide: true
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const [manifest] = JSON.parse(result.stdout);
const paths = manifest.files.map((file) => file.path.replaceAll('\\', '/'));
const forbidden = paths.filter((path) =>
  path.includes('/target/') ||
  path.startsWith('native/radiochron-desktop-bridge/') ||
  path.endsWith('.tgz')
);
if (forbidden.length > 0) {
  throw new Error(`package contains build artifacts: ${forbidden.slice(0, 5).join(', ')}`);
}

const expectedBinaries = [
  'vendor-core/win32-x64/radiochron-node-bridge.exe',
  'vendor-core/linux-x64/radiochron-node-bridge',
  'vendor-core/linux-arm64/radiochron-node-bridge',
  'vendor-core/darwin-x64/radiochron-node-bridge',
  'vendor-core/darwin-arm64/radiochron-node-bridge'
];
for (const path of expectedBinaries) {
  if (!paths.includes(path)) throw new Error(`package is missing ${path}`);
}

if (manifest.entryCount > 100 || manifest.unpackedSize > 15_000_000) {
  throw new Error(`package is unexpectedly large: ${manifest.entryCount} files, ${manifest.unpackedSize} bytes unpacked`);
}

console.log(`verified ${manifest.id}: ${manifest.entryCount} files, ${manifest.size} bytes packed`);
