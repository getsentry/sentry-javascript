import { execSync } from 'child_process';
import { error, log } from 'console';
import { exit } from 'process';

const args = ['--Werror', '-i', '--style=file', 'bindings/cpu_profiler.cc'];
const cmd = `./node_modules/.bin/clang-format ${args.join(' ')}`;

execSync(cmd);

log('clang-format: done, checking tree...');

const diff = execSync(`git status --short`).toString();

if (diff) {
  error('clang-format: check failed ❌');
  exit(1);
}

log('clang-format: check passed ✅');
