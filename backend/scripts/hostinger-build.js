'use strict';

/**
 * Hostinger build entry. Never depends on bare `tsc` being on PATH.
 * Runtime uses server.js + tsx, so compile is optional.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'server.js');
const tscJs = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

if (!fs.existsSync(entry)) {
  console.error('[build] missing server.js');
  process.exit(1);
}

// Optional compile if typescript is present (does not fail deploy if skipped)
if (fs.existsSync(tscJs)) {
  const result = spawnSync(process.execPath, [tscJs, '-p', 'tsconfig.json'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status === 0) {
    console.log('[build] tsc OK');
  } else {
    console.warn('[build] tsc failed — continuing with tsx runtime (server.js)');
  }
} else {
  console.log('[build] typescript not installed — using tsx runtime (server.js)');
}

console.log('[build] success');
process.exit(0);
