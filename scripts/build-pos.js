#!/usr/bin/env node

/**
 * Build script for POS Terminal (Electron app)
 * Builds the renderer (React) and packages with Electron Builder
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function log(message) {
  console.log(`\n[POS Build] ${message}`);
}

function exec(command, options = {}) {
  console.log(`> ${command}`);
  execSync(command, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    ...options,
  });
}

async function build() {
  try {
    log('Starting POS Terminal build...');

    // Clean previous build
    log('Cleaning previous build...');
    if (fs.existsSync(DIST_DIR)) {
      fs.rmSync(DIST_DIR, { recursive: true });
    }

    // Install dependencies
    log('Installing dependencies...');
    exec('npm install');

    // Generate Prisma client for SQLite
    log('Generating Prisma client...');
    exec('npx prisma generate');

    // Build renderer (React)
    log('Building renderer...');
    exec('npm run build:renderer');

    // Build main process (Electron)
    log('Building main process...');
    exec('npm run build:main');

    // Package with Electron Builder
    log('Packaging application...');
    exec('npm run electron:build');

    log('Build completed successfully!');
    log(`Output: ${path.join(DIST_DIR, 'electron')}`);
  } catch (error) {
    console.error('\n[POS Build] Build failed:', error.message);
    process.exit(1);
  }
}

// Run build
build();
