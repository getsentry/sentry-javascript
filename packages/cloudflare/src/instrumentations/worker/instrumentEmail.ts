import type { EmailMessage, ExportedHandler } from '@cloudflare/workers-types';
import type { env as cloudflareEnv } from 'cloudflare:workers';
import {
  captureException,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { CloudflareOptions } from '../../client';
import { flushAndDispose } from '../../flush';
import { ensureInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { addCloudResourceContext } from '../../scope-utils';
import { init } from '../../sdk';
import { instrumentContext } from '../../utils/instrumentContext';
import { instrumentEnv } from './instrumentEnv';

/**
 * Core email handler logic - wraps execution with Sentry instrumentation.
 */
function wrapEmailHandler(
  emailMessage: EmailMessage,
  options: CloudflareOptions,
  context: ExecutionContext,
  fn: () => unknown,
): unknown {
  return withIsolationScope(isolationScope => {
    const waitUntil = context.waitUntil.bind(context);

    const client = init({ ...options, ctx: context });
    isolationScope.setClient(client);

    addCloudResourceContext(isolationScope);

    return startSpan(
      {
        op: 'faas.email',
        name: `Handle Email ${emailMessage.to}`,
        attributes: {
          'faas.trigger': 'email',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.email',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
        },
      },
      async () => {
        try {
          return await fn();
        } catch (e) {
          captureException(e, { mechanism: { handled: false, type: 'auto.faas.cloudflare.email' } });
          throw e;
        } finally {
          waitUntil(flushAndDispose(client));
        }
      },
    );
  });
}

/**
 * Instruments an email handler for ExportedHandler (env/ctx come from args).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function instrumentExportedHandlerEmail<T extends ExportedHandler<any, any, any>>(
  handler: T,
  optionsCallback: (env: typeof cloudflareEnv) => CloudflareOptions | undefined,
): void {
  if (!('email' in handler) || typeof handler.email !== 'function') {
    return;
  }

  handler.email = ensureInstrumented(
    handler.email,
    original =>
      new Proxy(original, {
        apply(target, thisArg, args: Parameters<NonNullable<T['email']>>) {
          const [emailMessage, env, ctx] = args;
          const context = instrumentContext(ctx);
          args[1] = instrumentEnv(env);
          args[2] = context;

          const options = getFinalOptions(optionsCallback(env), env);

          return wrapEmailHandler(emailMessage, options, context, () => target.apply(thisArg, args));
        },
      }),
  );
}
