// PreToolUse (Edit | Write | MultiEdit): main is production. Develop on dev.
// Bypass for a real hotfix: set ALLOW_MAIN_EDITS=1 (e.g. in .claude/settings.local.json "env").
import { spawnSync } from 'node:child_process';
import { block, norm, projectDir, readHookInput } from './_lib.ts';

interface Input {
  tool_input?: { file_path?: string };
}

if (process.env.ALLOW_MAIN_EDITS === '1') process.exit(0);

const input = readHookInput<Input>();
const file = norm(input?.tool_input?.file_path ?? '');

// Planning notes and Claude config are always fine.
if (/\/(tasks|\.claude)\//.test(file)) process.exit(0);

const res = spawnSync('git', ['branch', '--show-current'], { cwd: projectDir(), encoding: 'utf8' });
const branch = (res.stdout ?? '').trim();

if (branch === 'main' || branch === 'master') {
  block(
    `You are on '${branch}' (production). CLAUDE.md: always develop on 'dev'.\n` +
      `Run: git switch dev   (or set ALLOW_MAIN_EDITS=1 for an explicit hotfix).`,
  );
}
process.exit(0);
