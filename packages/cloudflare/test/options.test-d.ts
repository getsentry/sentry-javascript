import { DurableObject, WorkerEntrypoint, WorkflowEntrypoint } from 'cloudflare:workers';
import { describe, it } from 'vitest';
import type { CloudflareOptions } from '../src/client';
import { defineCloudflareOptions } from '../src/defineCloudflareOptions';
import { instrumentAgentWithSentry, instrumentDurableObjectWithSentry } from '../src/durableobject';
import { instrumentWorkerEntrypoint } from '../src/instrumentations/instrumentWorkerEntrypoint';
import { sentryPagesPlugin } from '../src/pages-plugin';
import { withSentry } from '../src/withSentry';
import { instrumentWorkflowWithSentry } from '../src/workflows';

interface TestEnv {
  SENTRY_DSN: string;
}

const dsn = 'https://public@dsn.ingest.sentry.io/1337';

const handler = {
  fetch(): Response {
    return new Response('ok');
  },
} satisfies ExportedHandler<TestEnv>;

class TestDurableObject extends DurableObject<TestEnv> {}

class TestWorkerEntrypoint extends WorkerEntrypoint<TestEnv> {
  public ping(): string {
    return 'pong';
  }
}

class TestWorkflow extends WorkflowEntrypoint<TestEnv> {
  public async run(): Promise<void> {}
}

declare const flag: boolean;
declare const preTypedOptions: CloudflareOptions;
declare const makeOptions: () => CloudflareOptions;

// The options callback returns a *fresh* object literal across a function boundary, where
// TypeScript's excess property check does not reach. `StrictCloudflareOptions` restores it —
// without these assertions a typo like `tracesSampleRte` silently compiles.
//
// Keep each asserted call on a single line: the formatter wraps longer calls and would move
// the `@ts-expect-error` directive away from the line the error is reported on.
describe('options are checked for unknown keys', () => {
  it('rejects an unknown key alongside valid ones', () => {
    // @ts-expect-error - `wrongKey` is not a CloudflareOptions key
    withSentry(env => ({ dsn: env.SENTRY_DSN, wrongKey: 123 }), handler);
  });

  it('rejects an options object where every key is unknown', () => {
    // @ts-expect-error - `tracesSampleRte` is a typo for `tracesSampleRate`
    withSentry(() => ({ tracesSampleRte: 1 }), handler);
  });

  it('rejects a wrong value type on a known key', () => {
    // @ts-expect-error - `tracesSampleRate` is a number
    withSentry(() => ({ dsn, tracesSampleRate: 'high' }), handler);
  });

  it('rejects a callback returning a function instead of options', () => {
    // @ts-expect-error - the options factory was returned instead of called
    withSentry(() => makeOptions, handler);
  });

  it('rejects unknown keys in instrumentDurableObjectWithSentry', () => {
    // @ts-expect-error - `wrongKey` is not a CloudflareOptions key
    instrumentDurableObjectWithSentry(() => ({ dsn, wrongKey: 1 }), TestDurableObject);
  });

  it('rejects unknown keys in instrumentAgentWithSentry', () => {
    // @ts-expect-error - `wrongKey` is not a CloudflareOptions key
    instrumentAgentWithSentry(() => ({ dsn, wrongKey: 1 }), TestDurableObject);
  });

  it('rejects unknown keys in instrumentWorkerEntrypoint', () => {
    // @ts-expect-error - `wrongKey` is not a CloudflareOptions key
    instrumentWorkerEntrypoint(() => ({ dsn, wrongKey: 1 }), TestWorkerEntrypoint);
  });

  it('rejects unknown keys in instrumentWorkflowWithSentry', () => {
    // @ts-expect-error - `wrongKey` is not a CloudflareOptions key
    instrumentWorkflowWithSentry(() => ({ dsn, wrongKey: 1 }), TestWorkflow);
  });

  it('rejects unknown keys in defineCloudflareOptions', () => {
    // @ts-expect-error - `wrongKey` is not a CloudflareOptions key
    defineCloudflareOptions(() => ({ dsn, wrongKey: 1 }));
    // @ts-expect-error - `wrongKey` is not a CloudflareOptions key
    defineCloudflareOptions({ dsn, wrongKey: 1 });
  });

  it('rejects unknown keys in sentryPagesPlugin', () => {
    // @ts-expect-error - `wrongKey` is not a CloudflareOptions key
    sentryPagesPlugin(() => ({ dsn, wrongKey: 1 }));
    // @ts-expect-error - `wrongKey` is not a CloudflareOptions key
    sentryPagesPlugin({ dsn, wrongKey: 1 });
  });
});

describe('valid options keep compiling', () => {
  it('accepts known keys, including Cloudflare-specific ones', () => {
    withSentry(
      env => ({
        dsn: env.SENTRY_DSN,
        tracesSampleRate: 1,
        serverName: 'my-worker',
        rpcTracePropagationTargets: ['ORDERS', /^SVC_/],
        durableObjectSqlSpanAllowlist: ['cf_my_table', /^cf_reports_/],
        beforeSend: event => event,
        integrations: [],
      }),
      handler,
    );
  });

  it('accepts arbitrary keys under `_experiments`', () => {
    withSentry(() => ({ _experiments: { someExperimentalFlag: true } }), handler);
  });

  it('accepts an undefined return, conditional or not', () => {
    withSentry(() => undefined, handler);
    withSentry(() => (flag ? { dsn } : undefined), handler);
  });

  it('accepts a pre-typed options object and spreads of it', () => {
    withSentry(() => preTypedOptions, handler);
    withSentry(() => ({ ...preTypedOptions, dsn }), handler);
  });

  it('still infers the env from the handler', () => {
    withSentry(env => {
      const envDsn: string = env.SENTRY_DSN;
      return { dsn: envDsn };
    }, handler);
  });
});
