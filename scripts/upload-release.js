const { execSync } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');
const { version } = require('../package.json');

// electron-builder artifactName: 'POSGRO-Setup-${version}.exe'
const localExe = `dist/POSGRO-Setup-${version}.exe`;
const remoteExe = `POSGRO-Setup-${version}.exe`;
const vps = 'bobur@144.91.121.160';
const remotePath = `/home/bobur/releases`;

// Patch latest.yml so the filename matches the remote exe name
const ymlPath = 'dist/latest.yml';
let yml = readFileSync(ymlPath, 'utf8');
yml = yml.replace(/path:.*\.exe/g, `path: ${remoteExe}`);
yml = yml.replace(/url:.*\.exe/g, `url: ${remoteExe}`);
writeFileSync(ymlPath, yml);

console.log(`Uploading v${version} to VPS...`);
execSync(`scp "${ymlPath}" ${vps}:${remotePath}/`, { stdio: 'inherit' });
execSync(`scp "${localExe}" "${vps}:${remotePath}/${remoteExe}"`, { stdio: 'inherit' });
console.log(`Done! v${version} is live at https://pos.bobur-dev.uz/releases/`);
