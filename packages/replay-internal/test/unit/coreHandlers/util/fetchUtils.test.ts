import { describe, expect, it, vi } from 'vitest';

import { useFakeTimers } from '../../../utils/use-fake-timers';

useFakeTimers();

import { _getResponseInfo } from '../../../../src/coreHandlers/util/fetchUtils';

describe('Unit | coreHandlers | util | fetchUtils', () => {
  describe('_getResponseInfo', () => {
    it('works with captureDetails: false', async () => {
      const res = await _getResponseInfo(
        false,
        {
          networkCaptureBodies: true,
          networkResponseHeaders: [],
        },
        undefined,
        undefined,
      );

      expect(res).toEqual(undefined);
    });

    it('works with captureDetails: false & responseBodySize', async () => {
      const res = await _getResponseInfo(
        false,
        {
          networkCaptureBodies: true,
          networkResponseHeaders: [],
        },
        undefined,
        123,
      );

      expect(res).toEqual({
        headers: {},
        size: 123,
        _meta: {
          warnings: ['URL_SKIPPED'],
        },
      });
    });

    it('works with text body', async () => {
      const encoder = new TextEncoder();

      const mockRead = vi
        .fn()
        .mockResolvedValueOnce({
          value: encoder.encode('text body'),
          done: false,
        })
        .mockResolvedValueOnce({
          value: null,
          done: true,
        });

      const response = {
        headers: {
          has: () => {
            return false;
          },
          get: () => {
            return undefined;
          },
        },
        body: {
          getReader: () => {
            return {
              read: mockRead,
              cancel: async (reason?: any) => {
                mockRead.mockRejectedValue(new Error(reason));
              },
              releaseLock: async () => {
                // noop
              },
            };
          },
        },
        clone: () => response,
        text: () => Promise.resolve('text body'),
      } as unknown as Response;

      const res = await _getResponseInfo(
        true,
        {
          networkCaptureBodies: true,
          networkResponseHeaders: [],
        },
        response,
        undefined,
      );

      expect(res).toEqual({
        headers: {},
        size: 9,
        body: 'text body',
      });
    });

    it('works with body that fails', async () => {
      const mockRead = vi.fn().mockRejectedValueOnce(new Error('cannot read'));

      const response = {
        headers: {
          has: () => {
            return false;
          },
          get: () => {
            return undefined;
          },
        },
        body: {
          getReader: () => {
            return {
              read: mockRead,
              cancel: async (_?: any) => {
                // noop
              },
              releaseLock: async () => {
                // noop
              },
            };
          },
        },
        clone: () => response,
        text: () => Promise.reject('cannot read'),
      } as unknown as Response;

      const res = await _getResponseInfo(
        true,
        {
          networkCaptureBodies: true,
          networkResponseHeaders: [],
        },
        response,
        undefined,
      );

      expect(res).toEqual({
        _meta: { warnings: ['BODY_PARSE_ERROR'] },
        headers: {},
        size: undefined,
      });
    });

    it('works with body that times out', async () => {
      const encoder = new TextEncoder();
      const mockRead = vi.fn();

      let cancelled = false;
      let cancellReason = '';

      const response = {
        headers: {
          has: () => {
            return false;
          },
          get: () => {
            return undefined;
          },
        },
        body: {
          getReader: () => {
            return {
              read: async () => {
                if (cancelled) {
                  mockRead.mockRejectedValue(new Error(cancellReason));
                } else {
                  mockRead.mockResolvedValueOnce({
                    value: encoder.encode('chunk'),
                    done: false,
                  });
                }

                await new Promise(res => {
                  setTimeout(() => {
                    res(1);
                  }, 200);
                });

                // eslint-disable-next-line no-return-await
                return await mockRead();
              },
              cancel: async (reason?: any) => {
                cancelled = true;
                cancellReason = reason;
              },
              releaseLock: async () => {
                // noop
              },
            };
          },
        },
        clone: () => response,
        text: () => new Promise(resolve => setTimeout(() => resolve('text body'), 1000)),
      } as unknown as Response;

      const [res] = await Promise.all([
        _getResponseInfo(
          true,
          {
            networkCaptureBodies: true,
            networkResponseHeaders: [],
          },
          response,
          undefined,
        ),
        vi.runAllTimersAsync(),
      ]);

      expect(res).toEqual({
        _meta: { warnings: ['BODY_PARSE_TIMEOUT'] },
        headers: {},
        size: undefined,
      });
    });
  });
});
