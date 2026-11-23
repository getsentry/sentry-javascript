import { SENTRY_OP, URL_PATH } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { SDK_VERSION } from '@sentry/node';
import * as SentryNode from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init as solidStartInit } from '../../src/server';

const browserInit = vi.spyOn(SentryNode, 'init');

describe('Initialize Solid Start SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SentryNode.getCurrentScope().setClient(undefined);
  });

  it('has the correct metadata', () => {
    const client = solidStartInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.solidstart',
          packages: [
            { name: 'npm:@sentry/solidstart', version: SDK_VERSION },
            { name: 'npm:@sentry/node', version: SDK_VERSION },
          ],
          version: SDK_VERSION,
        },
      },
    };

    expect(client).not.toBeUndefined();
    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
  });

  describe('ignoreSpans', () => {
    const startServerSpan = (path: string): SentryNode.Span =>
      SentryNode.startInactiveSpan({
        name: 'GET',
        forceTransaction: true,
        attributes: { [SENTRY_OP]: HTTP_SERVER, [URL_PATH]: path },
      });

    it.each(['/_build/assets/app.js', '/_build/assets/app.js.map', '/_build/.vite/manifest.json'])(
      'ignores build asset requests (%s)',
      path => {
        solidStartInit({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

        expect(startServerSpan(path).isRecording()).toBe(false);
      },
    );

    it.each(['/', '/_server', '/users/jane.doe', '/api/data.json', '/blog/_build/'])(
      'keeps route requests (%s)',
      path => {
        solidStartInit({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 });

        expect(startServerSpan(path).isRecording()).toBe(true);
      },
    );

    it('merges the default with user-provided ignoreSpans', () => {
      solidStartInit({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        ignoreSpans: [{ attributes: { [URL_PATH]: '/health' } }],
      });

      expect(startServerSpan('/health').isRecording()).toBe(false);
      expect(startServerSpan('/_build/assets/app.js.map').isRecording()).toBe(false);
    });
  });
});
