import * as SentryCore from '@sentry/core';
import * as SentryNode from '@sentry/node';
import {
  createTransport,
  NodeClient,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
  spanToStreamedSpanJSON,
} from '@sentry/node';
import { redirect } from '@solidjs/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withServerActionInstrumentation } from '../../src/server';

const mockCaptureException = vi.spyOn(SentryNode, 'captureException').mockImplementation(() => '');
const mockFlush = vi.spyOn(SentryCore, 'flushIfServerless').mockImplementation(async () => {});
const mockGetActiveSpan = vi.spyOn(SentryCore, 'getActiveSpan');

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
    SentryCore.getMainCarrier().__SENTRY__ = undefined;
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

    client.on('spanStart', span => spanStartMock(spanToStreamedSpanJSON(span)));

    await serverActionGetPrefecture();
    expect(spanStartMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'getPrefecture',
        attributes: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function',
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
    const span = new SentryCore.SentrySpan({
      attributes: {
        'http.target': '/_server',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
      },
    });
    mockGetActiveSpan.mockReturnValue(span);
    const mockSpanSetAttribute = vi.spyOn(span, 'setAttribute');

    const getPrefecture = async function load() {
      return withServerActionInstrumentation('getPrefecture', () => {
        return { prefecture: 'Kagoshima' };
      });
    };

    await getPrefecture();

    expect(mockGetActiveSpan).to.toHaveBeenCalledTimes(2);
    expect(mockSpanSetAttribute).to.toHaveBeenCalledWith('http.route', 'getPrefecture');
    expect(mockSpanSetAttribute).to.toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  });

  // `@sentry/node`'s HTTP spans only carry `url.path`, so gating on `http.target` alone silently
  // skipped the rename.
  it('sets a server action name on the active span when the path is on `url.path`', async () => {
    const span = new SentryCore.SentrySpan({
      attributes: {
        'url.path': '/_server',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
      },
    });
    mockGetActiveSpan.mockReturnValue(span);
    const mockSpanSetAttribute = vi.spyOn(span, 'setAttribute');

    const getPrefecture = async function load() {
      return withServerActionInstrumentation('getPrefecture', () => {
        return { prefecture: 'Kagoshima' };
      });
    };

    await getPrefecture();

    expect(mockSpanSetAttribute).to.toHaveBeenCalledWith('http.route', 'getPrefecture');
    expect(mockSpanSetAttribute).to.toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  });

  it('does not set a server action name if the active span had a non `/_server` `url.path`', async () => {
    const span = new SentryCore.SentrySpan();
    span.setAttribute('url.path', '/users/5');
    mockGetActiveSpan.mockReturnValue(span);
    const mockSpanSetAttribute = vi.spyOn(span, 'setAttribute');

    const getPrefecture = async function load() {
      return withServerActionInstrumentation('getPrefecture', () => {
        return { prefecture: 'Kagoshima' };
      });
    };

    await getPrefecture();

    expect(mockSpanSetAttribute).not.toHaveBeenCalledWith('http.route', 'getPrefecture');
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
