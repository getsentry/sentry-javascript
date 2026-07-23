import * as SentryCore from '@sentry/core';
import { HTTP_ROUTE, URL_FULL, URL_PATH } from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AugmentedNextApiResponse, NextApiHandler } from '../../src/common/types';
import { wrapApiHandlerWithSentry } from '../../src/server';

const startSpanManualSpy = vi.spyOn(SentryCore, 'startSpanManual');

describe('withSentry', () => {
  let req: NextApiRequest, res: NextApiResponse;

  const origHandlerNoError: NextApiHandler = async (_req, res) => {
    res.send('Good dog, Maisey!');
  };

  const wrappedHandlerNoError = wrapApiHandlerWithSentry(origHandlerNoError, '/my-parameterized-route');

  beforeEach(() => {
    req = {
      headers: {
        host: 'dogs.are.great',
        'x-forwarded-proto': 'https',
      },
      url: '/api/dogs?good=true',
    } as NextApiRequest;
    res = {
      send: function (this: AugmentedNextApiResponse) {
        this.end();
      },
      end: function (this: AugmentedNextApiResponse) {
        // eslint-disable-next-line typescript/no-deprecated
        this.finished = true;
        // @ts-expect-error This is a mock
        this.writableEnded = true;
      },
    } as unknown as AugmentedNextApiResponse;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('tracing', () => {
    it('starts a transaction with normalized request URL attributes', async () => {
      await wrappedHandlerNoError(req, res);
      expect(startSpanManualSpy).toHaveBeenCalledWith(
        {
          name: 'GET /my-parameterized-route',
          op: 'http.server',
          forceTransaction: true,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nextjs',
            [URL_FULL]: 'https://dogs.are.great/api/dogs?good=true',
            [URL_PATH]: '/api/dogs',
            [HTTP_ROUTE]: '/my-parameterized-route',
          },
        },
        expect.any(Function),
      );
    });
  });
});
