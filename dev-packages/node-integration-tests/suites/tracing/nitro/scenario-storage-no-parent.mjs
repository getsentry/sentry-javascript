import assert from 'node:assert/strict';
import * as Sentry from '@sentry/node';
import { createStorage } from 'unstorage';
import { withTracing } from 'unstorage/tracing';

const storage = withTracing(createStorage());

async function readAndWrite(key) {
  await storage.setItem(key, 'value');
  assert.equal(await storage.getItem(key), 'value');
}

async function run() {
  await readAndWrite('before_parent');

  const parent = Sentry.startInactiveSpan({ name: 'parent operation' });
  await Sentry.withActiveSpan(parent, () => readAndWrite('inside_parent'));

  await readAndWrite('after_parent');
  await storage.dispose();

  // Flush every operation before the parent signals that span collection is complete.
  await Sentry.flush();
  parent.end();
  await Sentry.flush();
}

run();
