#!/usr/bin/env node

/**
 * Build script for VPS Server (NestJS API)
 * Builds the server for production deployment
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist', 'server');
const SERVER_SRC = path.join(ROOT_DIR, 'src', 'server');

function log(message) {
  console.log(`\n[Server Build] ${message}`);
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
    log('Starting VPS Server build...');

    // Clean previous build
    log('Cleaning previous build...');
    if (fs.existsSync(DIST_DIR)) {
      fs.rmSync(DIST_DIR, { recursive: true });
    }

    // Install dependencies
    log('Installing dependencies...');
    exec('npm install');

    // Generate Prisma client for PostgreSQL
    log('Generating Prisma client...');
    exec('npx prisma generate');

    // Build NestJS server
    log('Building server...');
    exec('npm run build:server');

    // Copy necessary files for deployment
    log('Copying deployment files...');

    // Copy package.json (production dependencies)
    const packageJson = require(path.join(ROOT_DIR, 'package.json'));
    const prodPackageJson = {
      name: packageJson.name,
      version: packageJson.version,
      main: 'main.js',
      scripts: {
        start: 'node main.js',
        'prisma:migrate': 'prisma migrate deploy',
        'prisma:generate': 'prisma generate',
      },
      dependencies: packageJson.dependencies,
    };

    fs.writeFileSync(
      path.join(DIST_DIR, 'package.json'),
      JSON.stringify(prodPackageJson, null, 2)
    );

    // Copy Prisma schema
    const prismaDir = path.join(DIST_DIR, 'prisma');
    if (!fs.existsSync(prismaDir)) {
      fs.mkdirSync(prismaDir, { recursive: true });
    }
    fs.copyFileSync(
      path.join(ROOT_DIR, 'prisma', 'schema.prisma'),
      path.join(prismaDir, 'schema.prisma')
    );

    log('Build completed successfully!');
    log(`Output: ${DIST_DIR}`);
    log('\nTo deploy:');
    log('1. Copy dist/server to your VPS');
    log('2. Run: npm install --production');
    log('3. Run: npx prisma migrate deploy');
    log('4. Run: npm start');
  } catch (error) {
    console.error('\n[Server Build] Build failed:', error.message);
    process.exit(1);
  }
}

// Run build
build();
