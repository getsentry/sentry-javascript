const { RuleTester } = require('eslint');

const captureExceptionFromCoreRule = require('../../../src/rules/captureException-from-core.js');
const ruleTester = new RuleTester({
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2015,
  },
});
ruleTester.run('captureException-from-core', captureExceptionFromCoreRule, {
  valid: [
    // Solo import
    "import { captureException } from '@sentry/core';",
    // Solo import and call
    "import { captureException, other } from '@sentry/core'; captureException('');",
    // One import among many
    "import { captureException, Hub } from '@sentry/core';",
    // One import among many and call
    "import { captureException, Hub } from '@sentry/core'; captureException('');",
    // Full module import
    "import * as SentryCore from '@sentry/core'; SentryCore.captureException('');",
    // Full module import used inside a function
    "import * as SentryCore from '@sentry/core'; const func = () => SentryCore.captureException('');",
  ],

  invalid: [
    // Solo import from browser SDK
    {
      code: "import { captureException } from '@sentry/browser';",
      errors: [{ messageId: 'errorMessage' }],
    },
    // Solo import from browser SDK and call
    {
      code: "import { captureException } from '@sentry/browser'; captureException('');",
      // Both halves of the code get flagged, so we have to anticipate two errors
      errors: [{ messageId: 'errorMessage' }, { messageId: 'errorMessage' }],
    },
    // Solo import from node SDK
    {
      code: "import { captureException } from '@sentry/node';",
      errors: [{ messageId: 'errorMessage' }],
    },
    // Solo import from node SDK and call
    {
      code: "import { captureException } from '@sentry/node'; captureException('');",
      // Both halves of the code get flagged, so we have to anticipate two errors
      errors: [{ messageId: 'errorMessage' }, { messageId: 'errorMessage' }],
    },
    // Solo import from wrapper SDK
    {
      code: "import { captureException } from '@sentry/nextjs';",
      errors: [{ messageId: 'errorMessage' }],
    },
    // Solo import from wrapper SDK and call
    {
      code: "import { captureException } from '@sentry/nextjs'; captureException('');",
      // Both halves of the code get flagged, so we have to anticipate two errors
      errors: [{ messageId: 'errorMessage' }, { messageId: 'errorMessage' }],
    },
    // One import among many, from a non-core SDK
    {
      code: "import { captureException, showReportDialog } from '@sentry/browser';",
      errors: [{ messageId: 'errorMessage' }],
    },
    // One import among many, from a non-core SDK and call
    {
      code: "import { captureException, showReportDialog } from '@sentry/browser'; captureException('')",
      // Both halves of the code get flagged, so we have to anticipate two errors
      errors: [{ messageId: 'errorMessage' }, { messageId: 'errorMessage' }],
    },
    // Full module import, from a non-core SDK
    {
      code: "import * as SentryBrowser from '@sentry/browser'; SentryBrowser.captureException('');",
      errors: [{ messageId: 'errorMessage' }],
    },
    // Called on `getCurrentHub` call
    {
      code: "import { getCurrentHub } from '@sentry/core'; getCurrentHub().captureException('');",
      errors: [{ messageId: 'errorMessage' }],
    },
    // Called on `getClient` call
    {
      code: "import { getCurrentHub } from '@sentry/core'; getCurrentHub().getClient().captureException('');",
      errors: [{ messageId: 'errorMessage' }],
    },
    // Called on `hub` object`
    {
      code: "import { getCurrentHub } from '@sentry/core'; const hub = getCurrentHub(); hub.captureException('');",
      errors: [{ messageId: 'errorMessage' }],
    },
    // Called on `client` object
    {
      code: "import { getCurrentHub } from '@sentry/core'; const client = getCurrentHub().getClient(); client.captureException('');",
      errors: [{ messageId: 'errorMessage' }],
    },
  ],
});
