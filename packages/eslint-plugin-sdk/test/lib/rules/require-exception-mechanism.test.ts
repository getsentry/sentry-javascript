import { RuleTester } from 'eslint';
import { describe, test } from 'vitest';
// @ts-expect-error untyped module
import rule from '../../../src/rules/require-exception-mechanism';

describe('require-exception-mechanism', () => {
  test('ruleTester', () => {
    const ruleTester = new RuleTester({
      parserOptions: {
        ecmaVersion: 2020,
      },
    });

    ruleTester.run('require-exception-mechanism', rule, {
      valid: [
        { code: "captureException(e, { mechanism: { handled: false, type: 'auto.http.express' } });" },
        { code: "captureException(e, { mechanism: { type: 'auto.http.express', handled: true, data: {} } });" },
        { code: "scope.captureException(e, { mechanism: { handled: false, type: 'auto.http.express' } });" },
        { code: "Sentry.captureException(e, { ...hint, mechanism: { handled: false, type: 'auto.http.express' } });" },
        { code: "captureException(e, { 'mechanism': { 'handled': false, 'type': 'auto.http.express' } });" },
        { code: 'captureException(e, { mechanism: MECHANISM });' },
        { code: 'captureException(e, { mechanism: getMechanism(e) });' },
        { code: "captureException(e, scope => markEventUnhandled(scope, 'auto.function.aws_serverless.handler'));" },
        {
          code: "captureException(e, function (scope) { return markEventUnhandled(scope, 'auto.function.serverless.gcp_http'); });",
        },
        { code: 'captureMessage(message);' },
        { code: 'foo.captureExceptionLater(e);' },
      ],
      invalid: [
        {
          code: 'captureException(e);',
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism' } }],
        },
        {
          code: 'captureException(e, hint);',
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism' } }],
        },
        {
          code: 'captureException(e, scope => scope);',
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism' } }],
        },
        {
          code: 'captureException(e, scope => markEventUnhandled(scope));',
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism' } }],
        },
        {
          code: "captureException(e, scope => { markEventUnhandled(scope, 'auto.x.y'); return otherScope; });",
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism' } }],
        },
        {
          code: "captureException(e, { level: 'fatal' });",
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism' } }],
        },
        {
          code: 'captureException(e, { ...hint });',
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism' } }],
        },
        {
          code: 'captureException(e, { mechanism: { handled: false } });',
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism.type' } }],
        },
        {
          code: "captureException(e, { mechanism: { type: 'auto.http.express' } });",
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism.handled' } }],
        },
        {
          code: 'captureException(e, { mechanism: { ...base } });',
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism.handled and mechanism.type' } }],
        },
        {
          code: 'scope.captureException(e);',
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism' } }],
        },
        {
          code: 'this._client.captureException(e, hint, scope);',
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism' } }],
        },
        {
          code: 'client?.captureException(e);',
          errors: [{ messageId: 'missingMechanism', data: { missing: 'mechanism' } }],
        },
      ],
    });
  });
});
