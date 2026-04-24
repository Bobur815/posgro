const { execSync } = require('child_process');
const { version } = require('../package.json');

const exe = `dist/grocery-pos Setup ${version}.exe`;
console.log(`Uploading v${version} to VPS...`);

execSync(`scp "dist/latest.yml" bobur@144.91.121.160:/home/bobur/releases/`, { stdio: 'inherit' });
execSync(`scp "${exe}" bobur@144.91.121.160:/home/bobur/releases/`, { stdio: 'inherit' });

console.log(`Done! v${version} is live at https://pos.bobur-dev.uz/releases/`);
