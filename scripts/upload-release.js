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

// ORDER MATTERS: the installer and its blockmap go up FIRST, and latest.yml — the file the
// updater actually polls — goes up LAST.
//
// latest.yml is what makes a release visible. Sending it first advertises a version whose .exe
// is still uploading, and a terminal that polls during those minutes sees an update, tries to
// fetch it, and fails on a file that is not there yet. Publishing the manifest last means the
// feed only ever names a file that is already complete on the server.
sftpUpload(localExe, remoteExe);

// Blockmap enables differential (delta) downloads — electron-updater fetches only the changed
// blocks instead of the whole installer. Also before latest.yml: a feed naming a version whose
// blockmap is missing makes every client fall back to a full download.
try {
  sftpUpload(localBlockmap, remoteBlockmap);
  console.log(`  blockmap uploaded → differential updates enabled`);
} catch {
  console.warn(`  warning: blockmap not found at ${localBlockmap}, differential updates disabled`);
}

// Last: this is the moment the release becomes live to every terminal in the field.
sftpUpload(ymlPath, 'latest.yml');

console.log(`Done! v${version} is live at https://pos.bobur-dev.uz/releases/`);
console.log(`            and at https://panel.posgro.uz/releases/ (same directory)`);
