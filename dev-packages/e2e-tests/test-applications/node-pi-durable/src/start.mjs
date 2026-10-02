import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The `flaky_step` tool exits the server mid-call with this code to simulate a crash. Restarting the
// server on the same storage, as a process manager would, is what lets the run resume.
const CRASH_EXIT_CODE = 75;

const appDir = fileURLToPath(new URL('..', import.meta.url));
rmSync(new URL('../.data', import.meta.url), { recursive: true, force: true });

let server;

function startServer() {
  server = spawn(process.execPath, ['--import', './instrument.mjs', 'src/server.mjs'], {
    cwd: appDir,
    stdio: 'inherit',
  });
  server.on('exit', code => {
    if (code === CRASH_EXIT_CODE) {
      startServer();
    } else {
      process.exit(code ?? 1);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.kill(signal);
    process.exit(0);
  });
}

startServer();
