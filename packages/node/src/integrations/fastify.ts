import { captureException, getCurrentHub, runWithAsyncContext } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';
import type * as http from 'http';

import type { NodeClient } from '../client';
import { isAutoSessionTrackingEnabled } from '../sdk';

// We do not want to have fastify as a dependency, so we mock the type here

type FastifyPlugin = (fastify: FastifyInstance, _options: unknown, pluginDone: () => void) => void;

type RequestHookHandler = (
  this: FastifyInstance,
  request: http.IncomingMessage,
  reply: unknown,
  done: () => void,
) => void;
interface FastifyInstance {
  register: (plugin: FastifyPlugin) => void;

  /**
   * `onRequest` is the first hook to be executed in the request lifecycle. There was no previous hook, the next hook will be `preParsing`.
   *  Notice: in the `onRequest` hook, request.body will always be null, because the body parsing happens before the `preHandler` hook.
   */
  /**
   * `onResponse` is the seventh and last hook in the request hook lifecycle. The previous hook was `onSend`, there is no next hook.
   * The onResponse hook is executed when a response has been sent, so you will not be able to send more data to the client. It can however be useful for sending data to external services, for example to gather statistics.
   */
  addHook(name: 'onRequest' | 'onResponse', hook: RequestHookHandler): void;

  /**
   * This hook is useful if you need to do some custom error logging or add some specific header in case of error.
   * It is not intended for changing the error, and calling reply.send will throw an exception.
   * This hook will be executed only after the customErrorHandler has been executed, and only if the customErrorHandler sends an error back to the user (Note that the default customErrorHandler always sends the error back to the user).
   * Notice: unlike the other hooks, pass an error to the done function is not supported.
   */
  addHook(
    name: 'onError',
    hook: (
      this: FastifyInstance,
      request: http.IncomingMessage,
      reply: unknown,
      error: Error,
      done: () => void,
    ) => void,
  ): void;
}

const SKIP_OVERRIDE = Symbol.for('skip-override');
const FASTIFY_DISPLAY_NAME = Symbol.for('fastify.display-name');

interface FastifyOptions {
  fastify: FastifyInstance;
}

const fastifyRequestPlugin = (): FastifyPlugin =>
  Object.assign(
    (fastify: FastifyInstance, _options: unknown, pluginDone: () => void) => {
      fastify.addHook('onRequest', (request, _reply, done) => {
        runWithAsyncContext(() => {
          const currentHub = getCurrentHub();
          currentHub.configureScope(scope => {
            scope.setSDKProcessingMetadata({
              request,
            });

            const client = currentHub.getClient<NodeClient>();
            if (isAutoSessionTrackingEnabled(client)) {
              const scope = currentHub.getScope();
              // Set `status` of `RequestSession` to Ok, at the beginning of the request
              scope.setRequestSession({ status: 'ok' });
            }
          });

          done();
        });
      });

      fastify.addHook('onResponse', (_request, _reply, done) => {
        const client = getCurrentHub().getClient<NodeClient>();
        if (isAutoSessionTrackingEnabled(client)) {
          setImmediate(() => {
            if (client && client['_captureRequestSession']) {
              // Calling _captureRequestSession to capture request session at the end of the request by incrementing
              // the correct SessionAggregates bucket i.e. crashed, errored or exited
              client['_captureRequestSession']();
            }
          });
        }

        done();
      });

      pluginDone();
    },
    {
      [SKIP_OVERRIDE]: true,
      [FASTIFY_DISPLAY_NAME]: 'SentryFastifyRequestPlugin',
    },
  );

export const fastifyErrorPlugin = (): FastifyPlugin =>
  Object.assign(
    (fastify: FastifyInstance, _options: unknown, pluginDone: () => void) => {
      fastify.addHook('onError', (_request, _reply, error, done) => {
        captureException(error);
        done();
      });

      pluginDone();
    },
    {
      [SKIP_OVERRIDE]: true,
      [FASTIFY_DISPLAY_NAME]: 'SentryFastifyErrorPlugin',
    },
  );

/** Capture errors for your fastify app. */
export class Fastify implements Integration {
  public static id: string = 'Fastify';
  public name: string = Fastify.id;

  private _fastify?: FastifyInstance;

  public constructor(options?: FastifyOptions) {
    const fastify = options?.fastify;
    this._fastify = fastify && typeof fastify.register === 'function' ? fastify : undefined;

    if (__DEBUG_BUILD__ && !this._fastify) {
      logger.warn('The Fastify integration expects a fastify instance to be passed. No errors will be captured.');
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    if (!this._fastify) {
      return;
    }

    void this._fastify.register(fastifyErrorPlugin());
    void this._fastify.register(fastifyRequestPlugin());
  }
}
