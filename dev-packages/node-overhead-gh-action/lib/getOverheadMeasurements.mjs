import { spawn } from 'child_process';
import { dirname, join } from 'path';
import treeKill from 'tree-kill';
import { fileURLToPath } from 'url';

const DEBUG = !!process.env.DEBUG;

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

async function getMeasurements(instrumentFile, autocannonCommand = 'yarn test:get') {
  const args = [join(packageRoot, './src/app.mjs')];

  if (instrumentFile) {
    args.unshift('--import', join(packageRoot, instrumentFile));
  }

  const cmd = `node ${args.join(' ')}`;

  log('--------------------------------');
  log(`Getting measurements for "${cmd}"`);

  const killAppProcess = await startAppProcess(cmd);

  log('Example app listening, running autocannon...');

  try {
    const result = await startAutocannonProcess(autocannonCommand);
    await killAppProcess();
    return result;
  } catch (error) {
    log(`Error running autocannon: ${error}`);
    await killAppProcess();
    throw error;
  }
}

async function startAppProcess(cmd) {
  const appProcess = spawn(cmd, { shell: true });

  log('Child process started, waiting for example app...');

  // Promise to keep track of the app process being closed
  let resolveAppClose, rejectAppClose;
  const appClosePromise = new Promise((resolve, reject) => {
    resolveAppClose = resolve;
    rejectAppClose = reject;
  });

  appProcess.on('close', code => {
    if (code && code !== 0) {
      rejectAppClose(new Error(`App process exited with code ${code}`));
    } else {
      resolveAppClose();
    }
  });

  await new Promise((resolve, reject) => {
    appProcess.stdout.on('data', data => {
      log(`appProcess: ${data}`);
      if (`${data}`.includes('Example app listening on port')) {
        resolve();
      }
    });

    appProcess.stderr.on('data', data => {
      log(`appProcess stderr: ${data}`);
      killProcess(appProcess);
      reject(data);
    });
  });

  return async () => {
    log('Killing app process...');
    appProcess.stdin.end();
    appProcess.stdout.end();
    appProcess.stderr.end();

    await killProcess(appProcess);
    await appClosePromise;
    log('App process killed');
  };
}

async function startAutocannonProcess(autocannonCommand) {
  const autocannon = spawn(autocannonCommand, {
    shell: true,
    cwd: packageRoot,
  });

  let lastJson = undefined;
  autocannon.stdout.on('data', data => {
    log(`autocannon: ${data}`);
    try {
      lastJson = JSON.parse(data);
    } catch {
      // do nothing
    }
  });

  return new Promise((resolve, reject) => {
    autocannon.stderr.on('data', data => {
      log(`autocannon stderr: ${data}`);
      lastJson = undefined;
      killProcess(autocannon);
    });

    autocannon.on('close', code => {
      log(`autocannon closed with code ${code}`);
      log(`Average requests: ${lastJson?.requests.average}`);

      if ((code && code !== 0) || !lastJson?.requests.average) {
        reject(new Error(`Autocannon process exited with code ${code}`));
      } else {
        resolve(Math.floor(lastJson.requests.average));
      }
    });
  });
}

export async function getOverheadMeasurements() {
  const GET = {
    baseline: await getMeasurements(undefined, 'yarn test:get'),
    withInstrument: await getMeasurements('./src/instrument.mjs', 'yarn test:get'),
    withInstrumentErrorOnly: await getMeasurements('./src/instrument-error-only.mjs', 'yarn test:get'),
  };

  const POST = {
    baseline: await getMeasurements(undefined, 'yarn test:post'),
    withInstrument: await getMeasurements('./src/instrument.mjs', 'yarn test:post'),
    withInstrumentErrorOnly: await getMeasurements('./src/instrument-error-only.mjs', 'yarn test:post'),
  };

  return {
    GET,
    POST,
  };
}

function log(message) {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(message);
  }
}

function killProcess(process) {
  return new Promise(resolve => {
    const pid = process.pid;

    if (!pid) {
      log('Process has no PID, fallback killing process...');
      process.kill();
      resolve();
      return;
    }

    treeKill(pid, () => {
      resolve();
    });
  });
}
