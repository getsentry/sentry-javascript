import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

const runParallel = process.argv.includes('--parallel');

/** Gets a list of src filenames, one for each integration and excludes the index.ts */
function getIntegrations(): string[] {
  const srcDir = join(__dirname, '..', 'src');
  const srcFiles = readdirSync(srcDir);
  // The index file is only there for the purposes of npm builds
  // (for the CDN we create a separate bundle for each integration)
  return srcFiles.filter(file => file !== 'index.ts');
}

/** Builds a bundle for a specific integration and JavaScript ES version */
async function buildBundle(integration: string, jsVersion: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('yarn', ['--silent', 'rollup', '--config', 'rollup.bundle.config.js'], {
      env: { ...process.env, INTEGRATION_FILE: integration, JS_VERSION: jsVersion },
    });

    child.on('exit', exitcode => {
      if (exitcode !== 0) {
        reject(new Error(`Failed to build bundle for integration "${integration}" with exit code: ${exitcode}`));
      } else {
        resolve();
      }
    });
  });
}

if (runParallel) {
  // We're building a bundle for each integration and each JavaScript version.
  const tasks = getIntegrations().reduce(
    (tasks, integration) => [...tasks, buildBundle(integration, 'es5'), buildBundle(integration, 'es6')],
    [] as Promise<void>[],
  );

  Promise.all(tasks)
    // eslint-disable-next-line no-console
    .then(_ => console.log('\nIntegration bundles built successfully'))
    .catch(error => {
      // eslint-disable-next-line no-console
      console.error(error);
      // Important to exit with a non-zero exit code, so that the build fails.
      process.exit(1);
    });
} else {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  (async () => {
    for (const integration of getIntegrations()) {
      await buildBundle(integration, 'es5');
      await buildBundle(integration, 'es6');
    }
    // eslint-disable-next-line no-console
    console.log('\nIntegration bundles built successfully');
  })();
}
