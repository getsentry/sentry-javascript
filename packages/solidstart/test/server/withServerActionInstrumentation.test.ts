import * as SentryNode from '@sentry/node';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  createTransport,
  getCurrentScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
} from '@sentry/node';
import { NodeClient } from '@sentry/node';
import { solidRouterBrowserTracingIntegration } from '@sentry/solidstart/solidrouter';
import { redirect } from '@solidjs/router';
import { Headers } from 'node-fetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureException = vi.spyOn(SentryNode, 'captureException').mockImplementation(() => '');
const mockFlush = vi.spyOn(SentryNode, 'flush').mockImplementation(async () => true);
const mockContinueTrace = vi.spyOn(SentryNode, 'continueTrace');

const mockGetRequestEvent = vi.fn();
vi.mock('solid-js/web', async () => {
  const original = await vi.importActual('solid-js/web');
  return {
    ...original,
    getRequestEvent: (...args: unknown[]) => mockGetRequestEvent(...args),
  };
});

import { withServerActionInstrumentation } from '../../src/server';

describe('withServerActionInstrumentation', () => {
  function createMockNodeClient(): NodeClient {
    return new NodeClient({
      integrations: [],
      tracesSampleRate: 1,
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
      _metadata: {
        sdk: {
          name: 'sentry.javascript.solidstart',
        },
      },
    });
  }

  // Mimics a server action function using sentry instrumentation
  const serverActionGetPrefecture = async function getPrefecture() {
    return withServerActionInstrumentation('getPrefecture', () => {
      return { prefecture: 'Kagoshima' };
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    getCurrentScope().setClient(undefined);
    getCurrentScope().clear();
    getIsolationScope().clear();
  });

  afterEach(() => {
    mockCaptureException.mockClear();
  });

  it('calls captureException', async () => {
    const error = new Error('Sample server action error');
    const serverAction = async function getData() {
      return withServerActionInstrumentation('getData', () => {
        throw error;
      });
    };

    const res = serverAction();
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(error, { mechanism: { handled: false, type: 'solidstart' } });
  });

  it("doesn't call captureException for thrown redirects", async () => {
    const serverRedirectAction = async function getData() {
      return withServerActionInstrumentation('getData', () => {
        throw redirect('/');
      });
    };

    const res = serverRedirectAction();
    await expect(res).rejects.toThrow();

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('calls `startSpan`', async () => {
    const spanStartMock = vi.fn();
    const client = createMockNodeClient();
    setCurrentClient(client);

    client.on('spanStart', span => spanStartMock(spanToJSON(span)));
    client.addIntegration(solidRouterBrowserTracingIntegration());

    await serverActionGetPrefecture();
    expect(spanStartMock).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'function.server_action',
        description: 'getPrefecture',
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.server_action',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
        }),
      }),
    );
  });

  it('calls `continueTrace` with the right sentry-trace and baggage', async () => {
    const baggage =
      'sentry-environment=qa,sentry-public_key=12345678,sentry-trace_id=4c9b164c5b5f4a0c8db3ce490b935ea8,sentry-sample_rate=1,sentry-sampled=true';
    const sentryTrace = '4c9b164c5b5f4a0c8db3ce490b935ea8';
    mockGetRequestEvent.mockReturnValue({
      request: {
        method: 'GET',
        url: '/_server',
        headers: new Headers([
          ['sentry-trace', sentryTrace],
          ['baggage', baggage],
        ]),
      },
    });

    await serverActionGetPrefecture();

    expect(mockContinueTrace).to.toHaveBeenCalledWith(
      expect.objectContaining({
        sentryTrace,
        baggage,
      }),
      expect.any(Function),
    );
  });

  it('calls `continueTrace` with no sentry-trace or baggage', async () => {
    mockGetRequestEvent.mockReturnValue({ request: {} });

    await serverActionGetPrefecture();

    expect(mockContinueTrace).to.toHaveBeenCalledWith(
      expect.objectContaining({
        sentryTrace: undefined,
        baggage: null,
      }),
      expect.any(Function),
    );
  });

  it('calls `flush` if lambda', async () => {
    vi.stubEnv('LAMBDA_TASK_ROOT', '1');

    await serverActionGetPrefecture();
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it('calls `flush` if vercel', async () => {
    vi.stubEnv('VERCEL', '1');

    await serverActionGetPrefecture();
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it('sets a server action transaction name', async () => {
    const getPrefecture = async function load() {
      return withServerActionInstrumentation('getPrefecture', () => {
        return { prefecture: 'Kagoshima' };
      });
    };

    await getPrefecture();

    expect(getIsolationScope().getScopeData().transactionName).toEqual('getPrefecture');
  });

  it('sets request data on the isolation scope', async () => {
    const baggage =
      'sentry-environment=qa,sentry-public_key=12345678,sentry-trace_id=4c9b164c5b5f4a0c8db3ce490b935ea8,sentry-sample_rate=1,sentry-sampled=true';
    const sentryTrace = '4c9b164c5b5f4a0c8db3ce490b935ea8';
    mockGetRequestEvent.mockReturnValue({
      request: {
        method: 'POST',
        url: '/_server',
        headers: new Headers([
          ['sentry-trace', sentryTrace],
          ['baggage', baggage],
        ]),
      },
    });

    await serverActionGetPrefecture();

    expect(getIsolationScope().getScopeData()).toEqual(
      expect.objectContaining({
        sdkProcessingMetadata: {
          request: {
            method: 'POST',
            url: '/_server',
            headers: {
              'sentry-trace': sentryTrace,
              baggage,
            },
          },
        },
      }),
    );
  });
});
