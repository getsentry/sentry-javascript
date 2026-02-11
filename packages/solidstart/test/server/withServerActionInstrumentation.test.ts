import * as SentryCore from '@sentry/core';
import * as SentryNode from '@sentry/node';
import {
  createTransport,
  getCurrentScope,
  getIsolationScope,
  NodeClient,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
  spanToJSON,
} from '@sentry/node';
import { redirect } from '@solidjs/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withServerActionInstrumentation } from '../../src/server';

const mockCaptureException = vi.spyOn(SentryNode, 'captureException').mockImplementation(() => '');
const mockFlush = vi.spyOn(SentryCore, 'flushIfServerless').mockImplementation(async () => {});
const mockGetActiveSpan = vi.spyOn(SentryNode, 'getActiveSpan');

const mockGetRequestEvent = vi.fn();
vi.mock('solid-js/web', async () => {
  const original = await vi.importActual('solid-js/web');
  return {
    ...original,
    getRequestEvent: (...args: unknown[]) => mockGetRequestEvent(...args),
  };
});

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
    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.function.solidstart' },
    });
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

    await serverActionGetPrefecture();
    expect(spanStartMock).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'function.server_action',
        description: 'getPrefecture',
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.server_action',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.solidstart',
        }),
      }),
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

  it('sets a server action name on the active span', async () => {
    const span = new SentryCore.SentrySpan();
    span.setAttribute('http.target', '/_server');
    mockGetActiveSpan.mockReturnValue(span);
    const mockSpanSetAttribute = vi.spyOn(span, 'setAttribute');

    const getPrefecture = async function load() {
      return withServerActionInstrumentation('getPrefecture', () => {
        return { prefecture: 'Kagoshima' };
      });
    };

    await getPrefecture();

    expect(mockGetActiveSpan).to.toHaveBeenCalledTimes(1);
    expect(mockSpanSetAttribute).to.toHaveBeenCalledWith('http.route', 'getPrefecture');
    expect(mockSpanSetAttribute).to.toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'component');
  });

  it('does not set a server action name if the active span had a non `/_server` target', async () => {
    const span = new SentryCore.SentrySpan();
    span.setAttribute('http.target', '/users/5');
    mockGetActiveSpan.mockReturnValue(span);
    const mockSpanSetAttribute = vi.spyOn(span, 'setAttribute');

    const getPrefecture = async function load() {
      return withServerActionInstrumentation('getPrefecture', () => {
        return { prefecture: 'Kagoshima' };
      });
    };

    await getPrefecture();

    expect(mockGetActiveSpan).to.toHaveBeenCalledTimes(1);
    expect(mockSpanSetAttribute).not.toHaveBeenCalled();
  });
});
