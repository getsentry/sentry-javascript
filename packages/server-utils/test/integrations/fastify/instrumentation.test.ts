import { channel } from 'node:diagnostics_channel';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { HANDLER, MIDDLEWARE } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import { setCurrentClient, spanToJSON } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentFastify } from '../../../src/integrations/fastify/instrumentation';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

type AnyFn = (...args: any[]) => any;

function createFastifyInstance(): { instance: any; registeredHooks: Record<string, AnyFn[]> } {
  const registeredHooks: Record<string, AnyFn[]> = {};
  const instance: any = {
    pluginName: 'fastify',
    decorate(name: string | symbol, value: unknown) {
      instance[name] = value;
    },
    decorateRequest() {},
    addHook(name: string, hook: AnyFn) {
      (registeredHooks[name] ??= []).push(hook);
      return instance;
    },
    setNotFoundHandler() {},
  };

  channel('fastify.initialization').publish({ fastify: instance });

  return { instance, registeredHooks };
}

function setUpClient(tracesSampleRate: number): Span[] {
  const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate }));
  setCurrentClient(client);
  client.init();

  const startedSpans: Span[] = [];
  client.on('spanStart', span => {
    startedSpans.push(span);
  });
  return startedSpans;
}

function createRequest(): any {
  return { method: 'GET', url: '/users/1', routeOptions: { url: '/users/:id' } };
}

// Runs the request lifecycle the way Fastify does: every later hook runs within the `onRequest`
// callback, and the instrumentation's own `onResponse` hook ends the request span before user ones.
function handleRequest(): void {
  const { instance, registeredHooks } = createFastifyInstance();
  instance.addHook('preHandler', function instanceHook() {});
  instance.addHook('onResponse', function responseHook() {});
  const routeOptions: any = { url: '/users/:id', preHandler: function routeHook() {}, handler: function getUser() {} };
  registeredHooks.onRoute![0]!.call(instance, routeOptions);
  const request = createRequest();
  const reply = { statusCode: 200 };

  registeredHooks.onRequest![0]!.call(instance, request, reply, () => {
    registeredHooks.preHandler![0]!.call(instance, request, reply, () => {});
    routeOptions.preHandler.call(instance, request, reply, () => {});
    routeOptions.handler.call(instance, request, reply);
    for (const onResponse of registeredHooks.onResponse!) {
      onResponse.call(instance, request, reply, () => {});
    }
  });
}

describe('Fastify instrumentation', () => {
  instrumentFastify();

  afterEach(() => {
    setCurrentClient(undefined as unknown as TestClient);
  });

  describe('on unsampled requests', () => {
    it('does not start spans for hooks or the route handler', () => {
      const startedSpans = setUpClient(0);

      handleRequest();

      expect(startedSpans).toHaveLength(1);
      expect(spanToJSON(startedSpans[0]!).name).toBe('GET /users/:id');
      expect(startedSpans[0]!.isRecording()).toBe(false);
    });

    it('calls hooks with the original `this` and arguments and returns their result', () => {
      setUpClient(0);
      const { instance, registeredHooks } = createFastifyInstance();
      const hook = vi.fn(() => 'hook result');
      instance.addHook('preHandler', hook);
      const request = createRequest();
      registeredHooks.onRequest![0]!.call(instance, request, {}, () => {});
      const reply = {};
      const done = (): void => {};

      const result = registeredHooks.preHandler![0]!.call(instance, request, reply, done);

      expect(result).toBe('hook result');
      expect(hook).toHaveBeenCalledWith(request, reply, done);
      expect(hook.mock.contexts).toEqual([instance]);
    });

    it('propagates errors thrown or rejected by hooks', async () => {
      setUpClient(0);
      const { instance, registeredHooks } = createFastifyInstance();
      const syncError = new Error('sync hook error');
      const asyncError = new Error('async hook error');
      instance.addHook('preHandler', () => {
        throw syncError;
      });
      instance.addHook('onSend', async () => {
        throw asyncError;
      });
      const request = createRequest();
      registeredHooks.onRequest![0]!.call(instance, request, {}, () => {});

      expect(() => registeredHooks.preHandler![0]!.call(instance, request, {}, () => {})).toThrow(syncError);
      await expect(registeredHooks.onSend![0]!.call(instance, request, {}, 'payload', () => {})).rejects.toBe(
        asyncError,
      );
    });
  });

  describe('on sampled requests', () => {
    it('starts spans for hooks and the route handler as children of the request span', () => {
      const startedSpans = setUpClient(1);

      handleRequest();

      const [requestSpan, ...childSpans] = startedSpans.map(span => spanToJSON(span));
      expect(requestSpan).toMatchObject({ name: 'GET /users/:id' });
      expect(childSpans).toEqual([
        expect.objectContaining({
          name: 'fastify - preHandler',
          parent_span_id: requestSpan!.span_id,
          attributes: expect.objectContaining({ [SENTRY_OP]: MIDDLEWARE }),
        }),
        expect.objectContaining({
          name: 'preHandler - routeHook',
          parent_span_id: requestSpan!.span_id,
        }),
        expect.objectContaining({
          name: 'fastify - route-handler',
          parent_span_id: requestSpan!.span_id,
          attributes: expect.objectContaining({ [SENTRY_OP]: HANDLER }),
        }),
        expect.objectContaining({
          name: 'fastify - onResponse',
          parent_span_id: requestSpan!.span_id,
          attributes: expect.objectContaining({ [SENTRY_OP]: MIDDLEWARE }),
        }),
      ]);
    });
  });
});
