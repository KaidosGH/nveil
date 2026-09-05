// One-command test orchestration: spins up everything the e2e / UI suites
// need (a throwaway Postgres via Docker, a production build, a running
// server), runs the suite, tears everything down. No dev data, .env or
// migrations involved — the app self-applies its schema to the empty
// scratch database.
//
// Usage:
//   npm run test:e2e                       # full stack: scratch Postgres + server + API e2e
//   npm run test:ui                        # same, for the browser regression suite
//   BASE_URL=http://localhost:3200 npm run test:e2e   # passthrough (what CI does)
//   EXTERNAL_SERVER=1 npm run test:e2e     # suite against BASE_URL / the :3100 default
//   FORCE_BUILD=1 npm run test:e2e         # rebuild even if a build exists
//   KEEP_DB=1 npm run test:e2e             # keep the scratch Postgres for debugging
//
// Passthrough keeps CI byte-identical: with BASE_URL (or EXTERNAL_SERVER=1)
// set, the orchestrator only execs the suite against the existing server —
// exactly the environment variables the workflow already provides.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

// Same throwaway key pattern as CI: guards a test-only queue on a scratch
// database that is destroyed after the run.
const TEST_ABUSE_KEY = 'local-test-only-abuse-key-0123456789abcdef';

const TARGETS = {
  e2e: {
    script: 'tests/e2e.mjs',
    serverEnv: { NVEIL_REPORT_ABUSE: 'true', NVEIL_REPORT_ABUSE_KEY: TEST_ABUSE_KEY },
    testEnv: { TEST_ABUSE: '1', ABUSE_KEY: TEST_ABUSE_KEY },
  },
  ui: {
    script: 'tests/ui-regression.mjs',
    // UI flows create secrets and must not collide with e2e's spent budget.
    serverEnv: { RATE_LIMIT_CREATE_PER_HOUR: '1000' },
    testEnv: {},
    browser: true,
  },
};

const DB_NAME = 'nveil-e2e-db';
const PG_IMAGE = 'postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685';

const run = (cmd, opts = {}) => spawnSync(cmd, { shell: true, stdio: 'inherit', ...opts });
// Full spawnSync result (status + stdout) — callers pick what they need.
const runOut = (cmd, opts = {}) => spawnSync(cmd, { shell: true, encoding: 'utf8', ...opts });

const cleanups = [];
let shuttingDown = false;
async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const fn of cleanups.reverse()) await fn();
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

const die = async (message) => {
  console.error(`\n✖ ${message}`);
  await cleanup();
  process.exit(1);
};

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

const poll = async (fn, seconds, label) => {
  for (let i = 0; i < seconds * 2; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} was not ready within ${seconds}s`);
};

/** Throws with an actionable message when no usable browser is available. */
async function ensureBrowser() {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ channel: process.env.UI_BROWSER_CHANNEL ?? 'msedge' });
    await browser.close();
  } catch (error) {
    await die(
      'No usable browser for Playwright. Fix with either:\n' +
      "  npx playwright install chromium && UI_BROWSER_CHANNEL=chromium npm run test:ui\n" +
      '  or a system Edge/Chrome (the default channel is "msedge").\n' +
      `Original error: ${error.message.split('\n')[0]}`,
    );
  }
}

async function startScratchPostgres() {
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    await die('Docker is not reachable. Start Docker, or run against your own server: BASE_URL=http://localhost:3100 npm run test:e2e');
  }
  // Fresh container per run: hermetic (no state bleed), and the fixed name
  // is cleaned first so a crashed previous run cannot block this one. One
  // orchestrator run at a time by design.
  runOut(`docker rm -f ${DB_NAME}`, { stdio: 'ignore' });
  const password = crypto.randomBytes(16).toString('hex');
  const start = runOut(
    `docker run -d --rm --name ${DB_NAME} -e POSTGRES_USER=nveil -e POSTGRES_PASSWORD=${password} ` +
    `-e POSTGRES_DB=nveil -p 127.0.0.1::5432 ${PG_IMAGE}`,
  );
  if (start.status !== 0) await die('Could not start the scratch Postgres container (see output above).');
  cleanups.push(() => runOut(`docker rm -f ${DB_NAME}`, { stdio: 'ignore' }));

  const mapping = runOut(`docker port ${DB_NAME} 5432/tcp`).stdout.trim().split('\n').pop() ?? '';
  const port = mapping.split(':').pop();
  await poll(async () => runOut(`docker exec ${DB_NAME} pg_isready -q -U nveil`).status === 0, 30, 'Postgres');
  console.log(`• scratch Postgres ready on 127.0.0.1:${port} (throwaway, --rm)`);
  return `postgresql://nveil:${password}@127.0.0.1:${port}/nveil`;
}

async function startAppServer(databaseUrl, target) {
  if (!existsSync('.next/BUILD_ID') || process.env.FORCE_BUILD === '1') {
    console.log('• building production bundle…');
    if (run('npm run build').status !== 0) await die('Build failed.');
  }
  const port = await freePort();
  const server = spawn(process.execPath, [nextBin, 'start', '-p', String(port), '-H', '127.0.0.1'], {
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      ...target.serverEnv,
    },
    stdio: 'inherit',
  });
  cleanups.push(() => {
    server.kill();
    return new Promise((r) => setTimeout(r, 300));
  });
  const base = `http://127.0.0.1:${port}`;
  await poll(async () => {
    try {
      return (await fetch(`${base}/api/health`)).ok;
    } catch {
      return false;
    }
  }, 30, 'App server');
  console.log(`• app server ready at ${base}`);
  return { server, base };
}

const targetName = process.argv[2];
const target = TARGETS[targetName];
if (!target) {
  console.error(`Usage: node tests/orchestrate.mjs <${Object.keys(TARGETS).join('|')}>`);
  process.exit(2);
}

if (process.env.BASE_URL || process.env.EXTERNAL_SERVER === '1') {
  // Passthrough: CI (or a developer with a running server) provides it.
  const result = spawnSync(process.execPath, [target.script], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

if (target.browser) await ensureBrowser();

const databaseUrl = await startScratchPostgres();
const { server, base } = await startAppServer(databaseUrl, target);

let exitCode = 1;
try {
  const suite = spawn(process.execPath, [target.script], {
    env: { ...process.env, BASE_URL: base, ...target.testEnv },
    stdio: 'inherit',
  });
  exitCode = await new Promise((resolve) => suite.on('exit', resolve));
} finally {
  server.kill();
  await cleanup();
  if (process.env.KEEP_DB === '1') console.log(`• KEEP_DB=1 — scratch Postgres left running as ${DB_NAME}`);
}
process.exit(exitCode ?? 1);
