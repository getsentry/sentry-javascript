import * as SentryCore from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import type { NextApiRequest, NextApiResponse } from 'next';

import type { AugmentedNextApiResponse, NextApiHandler } from '../../src/common/types';
import { wrapApiHandlerWithSentry } from '../../src/server';

const startSpanManualSpy = jest.spyOn(SentryCore, 'startSpanManual');

describe('withSentry', () => {
  let req: NextApiRequest, res: NextApiResponse;

  const origHandlerNoError: NextApiHandler = async (_req, res) => {
    res.send('Good dog, Maisey!');
  };

  const wrappedHandlerNoError = wrapApiHandlerWithSentry(origHandlerNoError, '/my-parameterized-route');

  beforeEach(() => {
    req = { url: 'http://dogs.are.great' } as NextApiRequest;
    res = {
      send: function (this: AugmentedNextApiResponse) {
        this.end();
      },
      end: function (this: AugmentedNextApiResponse) {
        // eslint-disable-next-line deprecation/deprecation
        this.finished = true;
        // @ts-expect-error This is a mock
        this.writableEnded = true;
      },
    } as unknown as AugmentedNextApiResponse;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('tracing', () => {
    it('starts a transaction when tracing is enabled', async () => {
      await wrappedHandlerNoError(req, res);
      expect(startSpanManualSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'GET /my-parameterized-route',
          op: 'http.server',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nextjs',
          },
        }),
        expect.any(Function),
      );
    });
  });
});
