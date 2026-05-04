const { execSync } = require('child_process');
const { version } = require('../package.json');

// Local build output uses spaces (NSIS default); latest.yml uses hyphens (artifactName template).
// Specify the remote filename explicitly so they always match.
const localExe = `dist/posgro Setup ${version}.exe`;
const remoteExe = `POSGRO-Setup-${version}.exe`;
const vps = 'bobur@144.91.121.160';
const remotePath = `/home/bobur/releases`;

console.log(`Uploading v${version} to VPS...`);
execSync(`scp "dist/latest.yml" ${vps}:${remotePath}/`, { stdio: 'inherit' });
execSync(`scp "${localExe}" "${vps}:${remotePath}/${remoteExe}"`, { stdio: 'inherit' });
console.log(`Done! v${version} is live at https://pos.bobur-dev.uz/releases/`);
