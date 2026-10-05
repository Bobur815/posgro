// PreToolUse (Bash | PowerShell): hard-blocks commands that must never run from an agent session.
// Fails closed if the hook input cannot be parsed.
import { block, readHookInput } from './_lib.ts';

interface Input {
  tool_input?: { command?: string };
}

const input = readHookInput<Input>();
if (!input) block('guard-bash: could not parse hook input; blocking to be safe.');

const cmd = input?.tool_input?.command ?? '';

interface Rule {
  re: RegExp;
  why: string;
}

const rules: Rule[] = [
  // Destructive SQL
  { re: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA|COLUMN)\b/i, why: 'destructive SQL (DROP/TRUNCATE)' },
  { re: /\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/i, why: 'ALTER TABLE ... DROP COLUMN' },
  { re: /\bDELETE\s+FROM\s+["\w.]+\s*(;|"|'|$)/i, why: 'DELETE FROM without WHERE' },

  // Data-loss tooling
  { re: /\bdocker(?:-|\s+)compose\b[^|;&\n]*\bdown\b[^|;&\n]*(\s-v\b|--volumes)/i, why: 'docker compose down -v (deletes volumes)' },
  { re: /\bdocker\s+volume\s+(rm|prune)\b/i, why: 'docker volume rm/prune' },
  { re: /\bdocker\s+system\s+prune\b/i, why: 'docker system prune' },
  { re: /\bprisma\s+migrate\s+reset\b/i, why: 'prisma migrate reset' },
  { re: /(--force-reset|--accept-data-loss)/, why: 'Prisma data-loss flag' },
  { re: /\bprisma\s+db\s+push\b(?![^\n]*schema\.sqlite\.prisma)/i, why: 'prisma db push on the PostgreSQL schema' },

  // Production actions that belong to the human
  { re: /\bdeploy:pos\b|scripts[\\/]upload-release/i, why: 'publishes the installer to production; run it yourself' },
  { re: /\bprisma(?::|\s+)migrate(?::|\s+)deploy\b/i, why: 'production migrations run via the main-branch deploy' },
  // Pushing to main is not blocked here: it needs the user's OK after staging (CLAUDE.md), which
  // the "ask" rule in .claude/settings.json turns into a permission prompt on every push.
  { re: /\bgit\s+push\b[^\n]*(--force|\s-f\b)/i, why: 'force push' },
  { re: /\bgit\s+reset\s+--hard\b/i, why: 'git reset --hard' },
  // ssh/scp/rsync that mutate the PRODUCTION dir (~/posgro, not ~/posgro-staging)
  {
    re: /\b(ssh|scp|rsync)\b[^\n]*\/posgro(?![-\w])[^\n]*\b(up|down|restart|build|rm|exec|migrate|stop|kill|pull|checkout|reset|prune)\b/i,
    why: 'mutating the production directory (~/posgro) over ssh',
  },

  // Filesystem wipes (bash + Windows)
  { re: /\brm\s+-[a-z]*(rf|fr)[a-z]*\b/i, why: 'rm -rf' },
  { re: /Remove-Item\b[^\n]*-Recurse/i, why: 'Remove-Item -Recurse' },
  { re: /\b(rd|rmdir)\s+\/s\b/i, why: 'rd /s' },
  { re: /\bdel\s+\/[sq]\b/i, why: 'del /s or /q' },
];

for (const { re, why } of rules) {
  if (re.test(cmd)) {
    block(
      `BLOCKED by .claude/hooks/guard-bash.ts: ${why}.\n` +
        `Live store protection: ask the user and let them run it manually if it is truly intended.`,
    );
  }
}
process.exit(0);
