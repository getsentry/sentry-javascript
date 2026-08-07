import type { EmailMessage } from '@cloudflare/workers-types';
import type { AnyExportedHandler } from '../../types';
import type { env as cloudflareEnv } from 'cloudflare:workers';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { GENERAL_FUNCTION_SPAN_OP } from '@sentry/conventions/op';
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
import { setInvocationState } from '../../utils/invocationContext';
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

    setInvocationState(isolationScope, { ctx: context });

    const client = init({ ...options, ctx: context });
    isolationScope.setClient(client);

    addCloudResourceContext(isolationScope);

    return startSpan(
      {
        name: `Handle Email ${emailMessage.to}`,
        attributes: {
          [SENTRY_OP]: GENERAL_FUNCTION_SPAN_OP,
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
export function instrumentExportedHandlerEmail<T extends AnyExportedHandler>(
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
          const options = getFinalOptions(optionsCallback(env), env);
          args[1] = instrumentEnv(env, options);
          args[2] = context;

          return wrapEmailHandler(emailMessage, options, context, () => target.apply(thisArg, args));
        },
      }),
  );
}
