'use strict';

/**
 * Hostinger entry — plain Node only (no tsx/esbuild).
 * Build must produce dist/server.js via `npm run build`.
 */
const path = require('path');
const fs = require('fs');

const distEntry = path.join(__dirname, 'dist', 'server.js');

if (!fs.existsSync(distEntry)) {
  console.error('[boot] FATAL: dist/server.js missing.');
  console.error('[boot] Hostinger Build command must be: npm run build');
  console.error('[boot] Do NOT use tsx at runtime (esbuild EACCES on Hostinger).');
  process.exit(1);
}

console.log('[boot] loading dist/server.js');
require(distEntry);
