'use strict';

/**
 * Hostinger-compatible entry file (.js required).
 * Runs the TypeScript server via tsx — no tsc compile step needed on deploy.
 */
require('tsx/cjs');
require('./src/server.ts');
