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
      const response = {
        headers: {
          has: () => {
            return false;
          },
          get: () => {
            return undefined;
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
      const response = {
        headers: {
          has: () => {
            return false;
          },
          get: () => {
            return undefined;
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
      const response = {
        headers: {
          has: () => {
            return false;
          },
          get: () => {
            return undefined;
          },
        },
        clone: () => response,
        text: () => new Promise(resolve => setTimeout(() => resolve('text body'), 1000)),
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
  });
});
