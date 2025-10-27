import { tmpdir } from 'os';
import { join } from 'path';
import { rimrafSync } from 'rimraf';

const buildDir = join(tmpdir(), 'sentry-e2e-tests-*');

process.exit(Number(!rimrafSync([...process.argv.slice(2), buildDir], { glob: true })));
