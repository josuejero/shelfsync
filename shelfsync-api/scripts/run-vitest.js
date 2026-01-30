#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const args = process.argv.slice(2);
const normalized = args.filter((arg) => arg !== '--runInBand');

const isWindows = process.platform === 'win32';
const binName = `vitest${isWindows ? '.cmd' : ''}`;
const vitestBin = path.resolve(__dirname, '..', 'node_modules', '.bin', binName);

const child = spawn(vitestBin, normalized, { stdio: 'inherit' });

child.on('close', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
