// Stop: CLAUDE.md rule - Electron changes (src/main, src/renderer, src/shared) require a package.json version bump.
// Compares against local 'main'. Blocks stopping once; skips if stop_hook_active to avoid loops.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { block, projectDir, readHookInput } from './_lib.ts';

interface Input {
  stop_hook_active?: boolean;
}

const input = readHookInput<Input>();
if (input?.stop_hook_active) process.exit(0);

const cwd = projectDir();
const git = (...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });

if (git('rev-parse', '--verify', '--quiet', 'main').status !== 0) process.exit(0);

const lines = (s: string | null): string[] => (s ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
const files = new Set<string>([
  ...lines(git('diff', '--name-only', 'main...HEAD').stdout),
  ...lines(git('diff', '--name-only', 'HEAD').stdout),
  ...lines(git('ls-files', '--others', '--exclude-standard').stdout),
]);

const touchesElectron = [...files].some((f) => /^src\/(main|renderer|shared)\//.test(f));
if (!touchesElectron) process.exit(0);

const versionOf = (json: string): string | undefined => {
  try {
    return (JSON.parse(json) as { version?: string }).version;
  } catch {
    return undefined;
  }
};

const mainVersion = versionOf(git('show', 'main:package.json').stdout ?? '');
const currentVersion = versionOf(readFileSync(join(cwd, 'package.json'), 'utf8'));

if (mainVersion && currentVersion && mainVersion === currentVersion) {
  block(
    `Electron files changed (src/main | src/renderer | src/shared) but package.json is still ${currentVersion}, same as main.\n` +
      `CLAUDE.md: bump the version (patch = fix, minor = feature, major = breaking) before finishing, ` +
      `and remind the user to run \`npm run deploy:pos\` afterwards.\n` +
      `Tip: \`npm version patch --no-git-tag-version\` edits package.json without creating a commit/tag.`,
  );
}
process.exit(0);
