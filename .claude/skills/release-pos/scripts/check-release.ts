// Pre-release checks. Prints only non-secret facts (VPS_API_URL and version).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const PROD_HOST = 'pos.bobur-dev.uz';

const git = (...args: string[]): string =>
  (spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout ?? '').trim();

const errors: string[] = [];
const warnings: string[] = [];

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
console.log(`Version: ${pkg.version}`);

const branch = git('branch', '--show-current');
console.log(`Branch: ${branch}`);
if (branch !== 'main') warnings.push(`Not on main (on '${branch}'). Releases normally come from main after the server deploy.`);

if (git('status', '--porcelain')) warnings.push('Working tree is not clean.');

if (git('rev-parse', '--verify', '--quiet', 'main')) {
  try {
    const mainPkg = JSON.parse(git('show', 'main:package.json')) as { version: string };
    if (branch !== 'main' && mainPkg.version === pkg.version) errors.push(`Version ${pkg.version} equals main; bump it.`);
  } catch {
    warnings.push('Could not read package.json from main.');
  }
}

const envFile = join(root, '.env.pos');
if (!existsSync(envFile)) {
  errors.push('.env.pos not found.');
} else {
  const line = readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((l) => /^\s*VPS_API_URL\s*=/.test(l));
  const url = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') ?? '';
  console.log(`VPS_API_URL: ${url || '(missing)'}`);
  if (!url) errors.push('VPS_API_URL is missing in .env.pos.');
  else if (!url.includes(PROD_HOST) || /(^|\/\/)dev\./.test(url) || /localhost|127\.0\.0\.1/.test(url)) {
    errors.push(`VPS_API_URL must point at production (${PROD_HOST}), not staging or localhost.`);
  }
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`FAIL  ${e}`);
console.log(errors.length ? '\nNOT READY' : '\nPre-flight OK (still confirm items 2-7 of the checklist).');
process.exit(errors.length ? 1 : 0);
