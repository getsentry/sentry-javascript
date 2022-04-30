// A temporary hack to use sucrase versions of packages for testing in CI.

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function run(cmd: string, options?: childProcess.ExecSyncOptions): unknown {
  return childProcess.execSync(cmd, { stdio: 'inherit', ...options });
}

const ignorePackages = process.version.startsWith('v8')
  ? [
      '@sentry/ember',
      '@sentry-internal/eslint-plugin-sdk',
      '@sentry/react',
      '@sentry/wasm',
      '@sentry/gatsby',
      '@sentry/serverless',
      '@sentry/nextjs',
      '@sentry/angular',
    ]
  : ['@sentry/serverless'];

// clear current builds and rebuild with rollup/sucrase (this way, all of the extra, random stuff which gets built in
// the main build job remains, and only the part affected by this project gets overwritten)
if (process.env.SUCRASE) {
  // just to be super sure
  fs.readdirSync(path.join(process.cwd(), 'packages')).forEach(dir => {
    if (fs.existsSync(path.join(process.cwd(), 'packages', dir, 'build', 'npm'))) {
      run(`rm -rf packages/${dir}/build/npm/cjs`);
      run(`rm -rf packages/${dir}/build/npm/esm`);
    } else if (fs.existsSync(path.join(process.cwd(), 'packages', dir, 'build', 'cjs'))) {
      run(`rm -rf packages/${dir}/build/cjs`);
      run(`rm -rf packages/${dir}/build/esm`);
    }
  });

  // rebuild the packages we're going to test with rollup/sucrase
  run(`yarn build:rollup ${ignorePackages.map(dep => `--ignore="${dep}"`).join(' ')}`);
}
// if we're in tsc-land, rebuild using es5 - temporary until switch to sucrase
else {
  const baseTSConfigPath = 'packages/typescript/tsconfig.json';
  fs.writeFileSync(
    baseTSConfigPath,
    String(fs.readFileSync(baseTSConfigPath)).replace('"target": "es6"', '"target": "es5"'),
  );
  run(`yarn build:dev ${ignorePackages.map(dep => `--ignore="${dep}"`).join(' ')}`);
}
