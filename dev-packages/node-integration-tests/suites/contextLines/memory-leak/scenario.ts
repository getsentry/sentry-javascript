import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

import { runSentry } from './other-file';

runSentry();

const lsofOutput = execSync(`lsof -p ${process.pid}`, { encoding: 'utf8' });
const lsofTable = lsofOutput.split('\n');
const mainPath = __dirname.replace(`${path.sep}suites${path.sep}contextLines${path.sep}memory-leak`, '');
const numberOfLsofEntriesWithMainPath = lsofTable.filter(entry => entry.includes(mainPath));

// There should only be a single entry with the main path, otherwise we are leaking file handles from the
// context lines integration.
if (numberOfLsofEntriesWithMainPath.length > 1) {
  // eslint-disable-next-line no-console
  console.error('Leaked file handles detected');
  // eslint-disable-next-line no-console
  console.error(lsofTable);
  process.exit(1);
}
