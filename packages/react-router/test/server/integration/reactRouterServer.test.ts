import { HTTP_ROUTE } from '@sentry/conventions/attributes';
import type { Client, Event, EventType, StreamedSpanJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactRouterServerIntegration } from '../../../src/server/integration/reactRouterServer';
import * as serverBuild from '../../../src/server/serverBuild';

describe('reactRouterServerIntegration', () => {
  let registerServerBuildGlobalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    registerServerBuildGlobalSpy = vi.spyOn(serverBuild, 'registerServerBuildGlobal');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the server build global callback on setupOnce', () => {
    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(registerServerBuildGlobalSpy).toHaveBeenCalledTimes(1);
  });

  describe('processEvent', () => {
    const client = {} as Client;
    const hint = {};

    it('preserves http.route when it is not "*"', () => {
      const integration = reactRouterServerIntegration();
      const event = {
        type: 'transaction' as EventType,
        transaction: 'GET /users/:id',
        contexts: {
          trace: {
            data: { [HTTP_ROUTE]: '/users/:id' },
          },
        },
      } as unknown as Event;

      integration.processEvent!(event, hint, client);

      expect(event.contexts?.trace?.data?.[HTTP_ROUTE]).toBe('/users/:id');
    });

    it('deletes the bogus "*" route', () => {
      const integration = reactRouterServerIntegration();
      const event = {
        type: 'transaction' as EventType,
        transaction: 'GET /ssr',
        contexts: {
          trace: {
            data: { [HTTP_ROUTE]: '*' },
          },
        },
      } as unknown as Event;

      integration.processEvent!(event, hint, client);

      expect(event.contexts?.trace?.data?.[HTTP_ROUTE]).toBeUndefined();
    });
  });

  describe('processSegmentSpan', () => {
    const client = {} as Client;

    it('preserves http.route when it is not "*"', () => {
      const integration = reactRouterServerIntegration();
      const span = {
        name: 'GET /users/:id',
        attributes: { [HTTP_ROUTE]: '/users/:id' },
      } as unknown as StreamedSpanJSON;

      integration.processSegmentSpan!(span, client);

      expect(span.attributes?.[HTTP_ROUTE]).toBe('/users/:id');
    });

    it('deletes the bogus "*" route', () => {
      const integration = reactRouterServerIntegration();
      const span = {
        name: 'GET /ssr',
        attributes: { [HTTP_ROUTE]: '*' },
      } as unknown as StreamedSpanJSON;

      integration.processSegmentSpan!(span, client);

      expect(span.attributes?.[HTTP_ROUTE]).toBeUndefined();
    });
  });
});
