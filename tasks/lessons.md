# Lessons

Patterns worth not repeating, recorded as they come up.

## An "already exists" guard around schema creation hides every table added later

`createSchemaIfNeeded` in `src/main/database/sqlite-client.ts` returned early when `local_config`
was present. That made sense once — the tables did exist. But it meant a table added to that
function *afterwards* never reached a terminal whose database predated it. `audit_logs` shipped
exactly that way: present on databases created after it was added, missing forever on older ones,
and `smena:getCurrent` died with `no such table: audit_logs` on one store's terminal only.

`sqlite-schema.test.ts` could not catch it. That test walks the Prisma models, and `audit_logs` is
raw SQL — invisible to the very guard that exists for this class of failure.

**Rule:** schema setup must be idempotent and unconditional, not guarded on "does the first table
exist". Every statement there was already `IF NOT EXISTS`; running them all on every boot costs a
few no-op DDL parses and keeps a fresh database and an upgraded one identical. Where a check can
only see Prisma models, add one that starts from a *legacy* database and asserts the real outcome
— `legacy-upgrade.test.ts` does that, and fails on all five cases if the guard returns.

**Also: prove a regression test fails before trusting it.** The first run of that test passed with
the bug supposedly restored — the `sed` meant to re-introduce the guard had silently not matched,
so the test ran against the fixed code and proved nothing. Re-introducing the guard with a real
edit turned all five cases red, which is the only evidence that counts.

## `loadEnv(mode || 'pos', …)` never loaded `.env.pos` — and baked a DB password into the installer

`electron.vite.config.ts` did `loadEnv(mode || 'pos', process.cwd(), '')`. electron-vite always
supplies a mode (`development`/`production`), so the `|| 'pos'` fallback never fired and `.env.pos`
was never read. Vite's `loadEnv` still loads the root `.env` — the *server's* config — so every
`APP_ENV_KEYS` value came from there.

Two consequences, one cosmetic and one not:

- Editing `.env.pos` appeared to do nothing, because none of it was ever baked. `VPS_API_URL` and
  `STORE_ID` fell through to the hardcoded defaults in `app-config.ts`.
- `DATABASE_URL` *was* in the root `.env`, so `define` replaced `process.env.DATABASE_URL` at the
  one site that reads it — a startup diagnostic — with the literal
  `postgresql://postgres:<password>@localhost:5432/grocery_pos`. That string was compiled into
  `dist-electron/main/index.js`, shipped inside the installer, logged on every terminal boot, and
  uploaded by `flushLogs()` → `POST /logs/upload` into the VPS `terminal_logs` table.

**Rules:**
- Never pass a mode through `||` into `loadEnv`. Name the env file you mean: `loadEnv('pos', …)`.
- Only bake what the bundle actually needs. `DATABASE_URL` was never read at runtime — the
  terminal derives its own SQLite path and passes it to Prisma explicitly — so baking it bought
  nothing and cost a credential. It is now out of `APP_ENV_KEYS`.
- Redact connection strings before logging, fail-closed. These logs leave the machine. The first
  redactor tried to keep the username (`//user:***@`) and leaked half of a password containing an
  unescaped `@`; the greedy form that drops the whole authority is the right trade — over-redacting
  a diagnostic costs nothing.

## The web dashboard has two output directories, and the terminal serves the second one

`cd src/web && npm run build` writes to `dist/web` — which is what the **NestJS server** serves.
The **terminal's LAN dashboard** serves `dist-web`, a staged copy, because electron-builder
excludes its own output directory (`dist`) from the package. `scripts/stage-web-for-pos.mjs` makes
that copy, and `npm run build:web` is the script that runs both steps.

Running only the inner build looks like a complete success — Vite prints its asset table and exits
0 — while the running terminal keeps serving a build from the previous day. The report of "changes
not applied" was correct, and the source was fine the whole time: `dist-web/` was stamped a day
older than `dist/web/`, which is the check that would have caught it in seconds.

**Rules:**
- Build the web dashboard with `npm run build:web` from the repo root, never `npm run build` inside
  `src/web`. CLAUDE.md documents this; I used the inner one because I was already `cd`-ed there.
- A build is not evidence that the thing under test changed. When a change is verified by someone
  looking at a running app, check the artifact that app actually loads — compare timestamps, or
  grep the shipped bundle for a fingerprint of the new code. "It compiled" and "it is deployed" are
  different claims, and only the second one answers "is it live".
- The same split exists for the POS itself: `dist-renderer`/`dist-electron` are built, but a
  *packaged* terminal reads them from inside its installer, so an unpacked dev run and an installed
  one need different steps to pick a change up.

## The dashboard has two backends, and an OFFLINE_ONLY store never talks to the VPS one

`/analytics/data` exists twice: `src/server/modules/analytics/analytics.service.ts` (NestJS,
PostgreSQL) and `src/main/local-server/routes/analytics.ts` (the terminal's own HTTP server,
SQLite). The file itself says it is "a direct port… the same seven queries, translated". An
ONLINE store's dashboard hits the first; an OFFLINE_ONLY store's LAN dashboard hits the second and
never reaches the VPS at all.

A field added to the Nest service therefore reaches an OFFLINE_ONLY shop only if it is added to
the local route too. `rankingCategories` was added to one and not the other, and the dashboard
rendered an empty filter with `undefined` in the console — for the store that is precisely the one
running offline.

**Rules:**
- Changing an analytics/report endpoint means changing BOTH implementations. Grep
  `src/main/local-server/routes/` for the path before assuming a server change is complete.
- The same split exists for auth, products, suppliers, sales and inventory — the whole
  `local-server/routes/` directory mirrors Nest controllers.
- The shape assertion in `local-server.integration.test.ts` ("every section the dashboard reads")
  is the guard that catches this, and it did — it failed the moment the key list diverged. Keep
  that test exhaustive rather than loosening it to `toMatchObject`.
- When a symptom is "the API did not return X", identify WHICH server answered before concluding
  anything about deployment. Here the natural guess — "staging is not deployed to the VPS" — was
  reasonable and still wrong, because the VPS was not in the request path.

## A narrow grep is not evidence something is missing

Checking whether the release build regenerates the SQLite Prisma client, I looked at `build:pos`,
`prebuild`, and `postinstall`, found nothing, and reported that the build depends on whatever
happens to be on the build machine — recommending a fix to `build:pos`.

The script is called **`prebuild:pos`**, and npm runs `pre<script>` automatically for any script
name. It already ran `prisma:generate:sqlite`. The grep covered the generic `prebuild` and the
specific `build:pos`, and missed the specific `prebuild:pos` sitting between them.

**Rule:** when the conclusion is "X does not happen", print the whole neighbourhood rather than
grepping for the names X would have. `node -p "JSON.stringify(require('./package.json').scripts)"`
would have shown it immediately, and costs the same as the grep that missed it.

The half that was real stands: `src/generated/` is gitignored (`.gitignore:79`, zero tracked
files), so CLAUDE.md calling that client "committed" was wrong — it is regenerated per build. Being
right about the symptom is not being right about the cause.

## A column that is constant in every sample row is not identified by that sample

The Rongta PLU export (`src/shared/utils/rongta-txp.ts`) labelled TXP column 4 "department" and
column 7 "barcode type", and its doc comment called the layout "confirmed against a capture". It
wasn't. The factory sample file has the same value in columns 4 and 6–9 on every row, so matching
it against the capture only proved where those values sit, not what they mean. The column guesses
were wrong, and so was the price unit. The sample's `90` is 0.90, but the export wrote whole sums.
An import into the PLU manager showed both at once: "Barcode 2" and 23000 displayed as 230,00.

**Rule:** a field is identified only by data that varies it. When writing a file for someone
else's software, separate "position confirmed" from "meaning guessed" in the code and in the
report, and say which columns to check on screen after the first import. Treat a sample value
like `90` as the unit's first clue: a price that small usually has implied decimals.

## Reproduce a flake in the topology it fails in, not a tidier one

The full test run failed now and then with `fetch failed … ECONNRESET` in the LAN server suite,
only when the machine was saturated (a cold run: 7 ts-jest workers on 8 threads, ~190s instead of
~20s). The first experiment put the server in a child process and stalled the client — 0 failures
in 60 tries — and it would have been easy to call the keep-alive theory disproved. The tests run
server and client on **one** event loop; reproduced that way it failed 2 in 20 at Node's 5s
`keepAliveTimeout` and 0 in 20 at 65s.

**Rule:** a negative result only counts if the experiment shares the failing setup's topology —
same process boundaries, same event loop, same load. And when the same race can happen in
production (a satellite reusing a socket the main just closed), fix it in the code, not the test.

## An async function cannot hand back a promise

`settleSale()` was written to return the in-flight fiscalization so each caller could choose how
long to wait. Declared `async (): Promise<Promise<void> | null>` that is impossible: promises
flatten, so `await settleSale()` would have silently waited out the whole OFD round-trip on every
sale at the till's own counter. The typechecker caught it only because the result was then passed
where a promise was expected.

**Rule:** to return work still in progress from an async function, wrap it —
`{ fiscalizing: Promise<void> | null }`.

## Classify errors by name, not instanceof, when they may come from another realm

`isNetworkError` tested `err instanceof TypeError` to recognise fetch's `TypeError('fetch failed')`.
Node's fetch throws its own realm's TypeError; in a Jest context that is not the test's
`TypeError`, so "main unreachable" surfaced as an unexplained crash. The two-till e2e test found it.

**Rule:** for errors crossing a boundary you do not own (native fetch, another window, a worker),
match on `err.name` or `err.cause?.code`.

## Scripted edits on CRLF files: `.` does not match `\r`

A script inserted an import after the last `^import .*;\r?$` match. In JavaScript `.` excludes
`\r`, so the insertion point landed between `\r` and `\n` — one line ended `\r\r\n`, the new one in
a bare `\n`. With mixed endings git stops normalising the file, and three files showed as
~4,000-line diffs for a 60-line change.

**Rule:** after scripting edits in this repo (CRLF working copies), count line endings before
staging — a file with both CRLF and bare LF, or any `\r\r\n`, is broken. Prefer the Edit tool,
which preserves them; and never pass code containing backticks through a shell string.

## A process killer that matches on command-line text can match its own shell

The instance helper stopped Electron by `CommandLine -like '*ho-t1*'`. The shell running it had
`ho-t1.log` in its own command line, so it killed itself (exit 255, nothing launched). The fix that
followed required a `"` the real command line does not contain, and matched nothing. Separately, a
`| grep | tail` after launching Electron hung for five minutes: the pipe stays open while the
app's child processes hold inherited handles.

**Rule:** kill by process name *and* an anchored regex on the exact argument
(`Name -eq 'electron.exe' -and CommandLine -match 'user-data-dir=\S*ho-t1(\s|"|$)'`), and send a
background launcher's output to a file, never through a pipe.

## A new test that listens on a port must check which ports the other suites use

`handoff.e2e.test.ts` took 5398–5400, already used by `satellite.integration` and
`local-server.integration`. Alone every suite passed; in the parallel full run ten tests of another
suite failed, which looked like load flakiness until the ports were compared.

**Rule:** before choosing a port in a test, grep `*.test.ts` for `PORT =` and `listen(`; when a
suite fails only in the full run, check shared ports before blaming load.
