'use strict';

/**
 * Best-effort: make native bins executable after npm install on Linux/Hostinger.
 * (Does not fix EACCES for runtime esbuild — we avoid esbuild entirely in production.)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');

if (process.platform === 'win32') {
  process.exit(0);
}

try {
  execSync(
    'chmod -R a+x node_modules/.bin node_modules/@esbuild/*/bin node_modules/esbuild/bin 2>/dev/null || true',
    { cwd: root, stdio: 'ignore', shell: true }
  );
} catch (_) {
  /* ignore */
}

// Keep portable tsc shim for Hostinger build commands set to bare `tsc`
try {
  require('./install-tsc-shim.js');
} catch (err) {
  console.warn('[postinstall] tsc shim skipped:', err && err.message);
}

process.exit(0);
