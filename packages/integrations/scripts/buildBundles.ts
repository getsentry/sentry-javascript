import { spawnSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

function getIntegrations(): string[] {
  // The index file is only there for the purposes of npm builds (for the CDN we create a separate bundle for each
  // integration) and the flags file is just a helper for including or not including debug logging, whose contents gets
  // incorporated into each of the individual integration bundles, so we can skip them both here.
  return readdirSync(join(__dirname, '..', 'src')).filter(file => !file.endsWith('index.ts'));
}

for (const integration of getIntegrations()) {
  for (const jsVersion of ['ES5', 'ES6']) {
    // run the build for each integration and js version
    spawnSync('yarn', ['--silent', 'rollup', '--config', 'rollup.bundle.config.js'], {
      env: { ...process.env, INTEGRATION_FILE: integration, JS_VERSION: jsVersion },
    });
  }
}

// eslint-disable-next-line no-console
console.log('\nIntegration bundles built successfully');
