// PostToolUse (Edit | Write | MultiEdit): run the repo's Prettier on edited src/**/*.{ts,tsx,json}.
// Mirrors `npm run format`, with the house style in .prettierrc.json. Never fails the turn.
//
// Only a file that was already Prettier-clean at HEAD (or is new) is formatted. About half the
// codebase predates any Prettier config; formatting one of those files would turn a three-line
// edit into a whole-file rewrite (tasks/lessons.md). Those files stay as they are until someone
// formats them on purpose, in a commit of their own.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { norm, projectDir, readHookInput } from './_lib.ts';

interface Input {
  tool_input?: { file_path?: string };
}

const input = readHookInput<Input>();
const file = norm(input?.tool_input?.file_path ?? '');
const root = norm(projectDir());

const inSrc = file.toLowerCase().startsWith(root.toLowerCase() + '/src/');
const wanted = /\.(ts|tsx|json)$/.test(file) && !/\/src\/generated\//.test(file);
if (!inSrc || !wanted) process.exit(0);

const candidates = [
  join(projectDir(), 'node_modules', 'prettier', 'bin', 'prettier.cjs'), // v3
  join(projectDir(), 'node_modules', 'prettier', 'bin-prettier.js'), // v2
];
const bin = candidates.find((p) => existsSync(p));
if (!bin) process.exit(0);

/** Was this file already in the house style before this branch touched it? New files count as yes. */
function cleanAtHead(): boolean {
  const rel = relative(projectDir(), file).replace(/\\/g, '/');
  const head = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: projectDir(), encoding: 'utf8' });
  if (head.status !== 0) return true; // not in HEAD: a new file
  const formatted = spawnSync(process.execPath, [bin!, '--stdin-filepath', rel], {
    cwd: projectDir(),
    input: head.stdout,
    encoding: 'utf8',
  });
  // If Prettier itself failed, do not touch the file.
  return formatted.status === 0 && formatted.stdout === head.stdout;
}

if (cleanAtHead()) {
  spawnSync(process.execPath, [bin, '--write', file], { cwd: projectDir(), stdio: 'ignore' });
}
process.exit(0);
