/* eslint-disable no-console */
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { publishPackages } from './lib/publishPackages';

const VERDACCIO_PORT = 4873;

let verdaccioChild: ChildProcess | undefined;

export interface RegistrySetupOptions {
  /**
   * When true, Verdaccio is spawned detached with stdio disconnected from the parent, then
   * the child is unref'd after a successful setup so the parent can exit while the registry
   * keeps running (e.g. `yarn test:prepare` then installs against 127.0.0.1:4873).
   */
  daemonize?: boolean;
}

/** Stops any Verdaccio runner from a previous prepare/run so port 4873 is free. */
function killStrayVerdaccioRunner(): void {
  spawnSync('pkill', ['-f', 'verdaccio-runner.mjs'], { stdio: 'ignore' });
}

async function groupCIOutput(groupTitle: string, fn: () => void | Promise<void>): Promise<void> {
  if (process.env.CI) {
    console.log(`::group::${groupTitle}`);
    try {
      await Promise.resolve(fn());
    } finally {
      console.log('::endgroup::');
    }
  } else {
    await Promise.resolve(fn());
  }
}

function waitUntilVerdaccioResponds(maxRetries: number = 60): Promise<void> {
  const pingUrl = `http://127.0.0.1:${VERDACCIO_PORT}/-/ping`;

  function tryOnce(): Promise<boolean> {
    return new Promise(resolve => {
      const req = http.get(pingUrl, res => {
        res.resume();
        resolve((res.statusCode ?? 0) > 0 && (res.statusCode ?? 500) < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  return (async () => {
    for (let i = 0; i < maxRetries; i++) {
      if (await tryOnce()) {
        return;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Verdaccio did not start in time.');
  })();
}

function startVerdaccioChild(configPath: string, port: number, daemonize: boolean): ChildProcess {
  const runnerPath = path.join(__dirname, 'verdaccio-runner.mjs');
  const verbose = process.env.E2E_VERDACCIO_VERBOSE === '1';
  return spawn(process.execPath, [runnerPath, configPath, String(port)], {
    detached: daemonize,
    stdio: daemonize && !verbose ? 'ignore' : 'inherit',
  });
}

async function stopVerdaccioChild(): Promise<void> {
  const child = verdaccioChild;
  verdaccioChild = undefined;
  if (!child || child.killed) {
    return;
  }
  child.kill('SIGTERM');
  await new Promise<void>(resolve => {
    child.once('exit', () => resolve());
    setTimeout(resolve, 5000);
  });
}

/** Drop the child handle so the parent process can exit; Verdaccio keeps running. */
function detachVerdaccioRunner(): void {
  const child = verdaccioChild;
  verdaccioChild = undefined;
  if (child && !child.killed) {
    child.unref();
  }
}

export async function registrySetup(options: RegistrySetupOptions = {}): Promise<void> {
  const { daemonize = false } = options;
  await groupCIOutput('Test Registry Setup', async () => {
    killStrayVerdaccioRunner();

    const configPath = path.join(__dirname, 'verdaccio-config', 'config.yaml');
    const storagePath = path.join(__dirname, 'verdaccio-config', 'storage');

    // Clear previous registry storage to ensure a fresh state
    fs.rmSync(storagePath, { recursive: true, force: true });

    // Verdaccio runs in a child process so tarball uploads are not starved by the
    // same Node event loop as ts-node (in-process runServer + npm publish could hang).
    console.log('Starting Verdaccio...');

    verdaccioChild = startVerdaccioChild(configPath, VERDACCIO_PORT, daemonize);

    try {
      await waitUntilVerdaccioResponds(60);
      console.log('Verdaccio is ready');

      await publishPackages();
    } catch (error) {
      await stopVerdaccioChild();
      throw error;
    }
  });

  if (daemonize) {
    detachVerdaccioRunner();
  }

  console.log('');
  console.log('');
}

export async function registryCleanup(): Promise<void> {
  await stopVerdaccioChild();
  killStrayVerdaccioRunner();
}
