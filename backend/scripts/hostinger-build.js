'use strict';

/**
 * Hostinger build: compile TypeScript with tsc only.
 * Never use tsx/esbuild (Hostinger blocks esbuild binary → EACCES → 503).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const root = path.join(__dirname, '..');
const tscJs = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const distEntry = path.join(root, 'dist', 'server.js');

function ensureTypescript() {
  if (fs.existsSync(tscJs)) return tscJs;
  console.log('[build] installing typescript...');
  execSync('npm install typescript --save --no-audit --no-fund', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development', npm_config_production: 'false' },
  });
  const resolved = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!fs.existsSync(resolved)) {
    throw new Error('typescript install failed — tsc not found');
  }
  return resolved;
}

const bin = ensureTypescript();
console.log('[build] compiling with tsc...');
const result = spawnSync(process.execPath, [bin, '-p', 'tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.error('[build] tsc failed');
  process.exit(result.status || 1);
}

if (!fs.existsSync(distEntry)) {
  console.error('[build] tsc finished but dist/server.js is missing');
  process.exit(1);
}

console.log('[build] OK -> dist/server.js');
process.exit(0);
