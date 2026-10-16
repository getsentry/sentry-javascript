import assert from 'node:assert';
import * as SentryBrowser from '@sentry/browser';
import * as SentryCore from '@sentry/core';
import * as SentryNode from '@sentry/node';

for (const namespace of [SentryBrowser, SentryCore, SentryNode]) {
  // The types of these entries report a default import as an error, because the ESM builds have no default export.
  assert.ok(!('default' in namespace));
}

assert.equal(typeof SentryBrowser.init, 'function');
assert.equal(typeof SentryCore.captureException, 'function');
assert.equal(typeof SentryNode.init, 'function');
