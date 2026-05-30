const { spawnSync } = require('child_process');
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
const localBlockmap = `dist/${localExeFile}.blockmap`;
const remoteBlockmap = `${remoteExe}.blockmap`;

// Patch latest.yml so the filename matches the remote exe name
const ymlPath = 'dist/latest.yml';
let yml = readFileSync(ymlPath, 'utf8');
yml = yml.replace(/path:.*\.exe/g, `path: ${remoteExe}`);
yml = yml.replace(/url:.*\.exe/g, `url: ${remoteExe}`);
writeFileSync(ymlPath, yml);

function sftpUpload(localFile, remoteFile) {
  const batch = `put "${localFile}" ${remotePath}/${remoteFile}\nbye\n`;
  const result = spawnSync(
    'sftp',
    ['-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=20', '-b', '-', vps],
    { input: batch, stdio: ['pipe', 'inherit', 'inherit'] }
  );
  if (result.status !== 0) {
    throw new Error(`sftp upload failed for ${localFile}`);
  }
}

console.log(`Uploading v${version} → ${remoteExe}`);
console.log(`  source: ${localExe}`);

sftpUpload(ymlPath, 'latest.yml');
sftpUpload(localExe, remoteExe);

// Upload blockmap for differential (delta) downloads — electron-updater uses this
// to download only the changed blocks instead of the full installer.
try {
  sftpUpload(localBlockmap, remoteBlockmap);
  console.log(`  blockmap uploaded → differential updates enabled`);
} catch {
  console.warn(`  warning: blockmap not found at ${localBlockmap}, differential updates disabled`);
}

console.log(`Done! v${version} is live at https://pos.bobur-dev.uz/releases/`);
