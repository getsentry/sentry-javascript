// The setup of https://github.com/getsentry/sentry-javascript/issues/3105: a default import, compiled to CJS.
import assert from 'node:assert';
import SentryBrowser from '@sentry/browser';
import SentryCore from '@sentry/core';
import SentryNode from '@sentry/node';

assert.equal(typeof SentryBrowser.init, 'function');
assert.equal(typeof SentryCore.captureException, 'function');
assert.equal(typeof SentryNode.init, 'function');
