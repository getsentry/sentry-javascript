const child_process = require('child_process');

const args = ['--Werror', '-i', '--style=file', 'bindings/cpu_profiler.cc'];
const cmd = `./node_modules/.bin/clang-format ${args.join(' ')}`;

child_process.execSync(cmd);

// eslint-disable-next-line no-console
console.log('clang-format: done, checking tree...');

const diff = child_process.execSync('git status --short').toString();

if (diff) {
  // eslint-disable-next-line no-console
  console.error('clang-format: check failed ❌');
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log('clang-format: check passed ✅');
