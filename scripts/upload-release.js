const { execSync } = require('child_process');
const { readFileSync, writeFileSync, readdirSync } = require('fs');
const { version } = require('../package.json');

const vps = 'bobur@144.91.121.160';
const remotePath = `/home/bobur/releases`;
const remoteExe = `POSGRO-Setup-${version}.exe`;

// Find the actual .exe electron-builder produced (name varies by config)
const distFiles = readdirSync('dist');
const localExeFile = distFiles.find(
  (f) => f.endsWith('.exe') && f.includes(version)
);
if (!localExeFile) {
  console.error(`No .exe containing version ${version} found in dist/`);
  console.error('Files in dist/:', distFiles.join(', '));
  process.exit(1);
}
const localExe = `dist/${localExeFile}`;

// Patch latest.yml so the filename matches the remote exe name
const ymlPath = 'dist/latest.yml';
let yml = readFileSync(ymlPath, 'utf8');
yml = yml.replace(/path:.*\.exe/g, `path: ${remoteExe}`);
yml = yml.replace(/url:.*\.exe/g, `url: ${remoteExe}`);
writeFileSync(ymlPath, yml);

console.log(`Uploading v${version} → ${remoteExe}`);
console.log(`  source: ${localExe}`);
execSync(`scp "${ymlPath}" ${vps}:${remotePath}/`, { stdio: 'inherit' });
execSync(`scp "${localExe}" "${vps}:${remotePath}/${remoteExe}"`, { stdio: 'inherit' });
console.log(`Done! v${version} is live at https://pos.bobur-dev.uz/releases/`);
