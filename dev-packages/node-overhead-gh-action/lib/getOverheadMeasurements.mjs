import { spawn } from 'child_process';

const DEBUG = !!process.env.DEBUG;

async function getMeasurements(instrumentFile) {
  const args = ['./src/app.mjs'];

  if (instrumentFile) {
    args.unshift('--import', instrumentFile);
  }

  const cmd = `node ${args.join(' ')}`;

  log(`Getting measurements for "${cmd}"`);

  const appProcess = spawn(cmd, { shell: true });

  log('Child process started, waiting for example app...');

  appProcess.stderr.on('data', data => {
    log(`appProcess stderr: ${data}`);
  });

  appProcess.on('exit', code => {
    log(`appProcess exited with code ${code}`);
  });

  await new Promise(resolve => {
    appProcess.stdout.on('data', data => {
      log(`appProcess: ${data}`);
      if (`${data}`.includes('Example app listening on port')) {
        resolve();
      }
    });
  });

  log('Example app listening, running autocannon...');

  const autocannon = spawn('yarn test', {
    shell: true,
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

  autocannon.stderr.on('data', data => {
    log(`autocannon stderr: ${data}`);
  });

  return new Promise(resolve => {
    autocannon.on('close', code => {
      log(`autocannon closed with code ${code}`);

      log(`Average requests: ${lastJson?.requests.average}`);

      appProcess.kill();

      resolve(lastJson?.requests.average);
    });
  });
}

export async function getOverheadMeasurements() {
  const baseline = await getMeasurements();
  const withInstrument = await getMeasurements('./src/instrument.mjs');
  const withInstrumentErrorOnly = await getMeasurements('./src/instrument-error-only.mjs');

  const withInstrumentPercentage = ((baseline - withInstrument) / baseline) * 100;
  const withInstrumentErrorOnlyPercentage = ((baseline - withInstrumentErrorOnly) / baseline) * 100;

  return {
    baseline,
    withInstrument,
    withInstrumentErrorOnly,
    withInstrumentPercentage,
    withInstrumentErrorOnlyPercentage,
  };
}

function log(message) {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(message);
  }
}
