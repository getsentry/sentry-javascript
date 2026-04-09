import * as fs from 'fs';

// Copy the bash wrapper script into the rollup output directory
// so the npm package ships both the compiled extension and the wrapper.
const targetDir = './build/lambda-extension';
const source = './src/lambda-extension/sentry-extension';
const target = `${targetDir}/sentry-extension`;

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

fs.copyFileSync(source, target);

// The wrapper must be executable because AWS Lambda discovers extensions by
// scanning /opt/extensions/ for executable files. If the file isn't executable,
// Lambda won't register it as an extension.
fs.chmodSync(target, 0o755);
