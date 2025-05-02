import { describe, expect, it, vi } from 'vitest';
import { _addTracingHeadersToFetchRequest } from '../../src/fetch';

const { DEFAULT_SENTRY_TRACE, DEFAULT_BAGGAGE } = vi.hoisted(() => ({
  DEFAULT_SENTRY_TRACE: 'defaultTraceId-defaultSpanId-1',
  DEFAULT_BAGGAGE: 'sentry-trace_id=defaultTraceId,sentry-sampled=true,sentry-sample_rate=0.5,sentry-sample_rand=0.232',
}));

const CUSTOM_SENTRY_TRACE = '123-abc-1';
const CUSTOM_BAGGAGE = 'sentry-trace_id=123,sentry-sampled=true';

vi.mock('../../src/utils/traceData', () => {
  return {
    getTraceData: vi.fn(() => {
      return {
        'sentry-trace': DEFAULT_SENTRY_TRACE,
        baggage: DEFAULT_BAGGAGE,
      };
    }),
  };
});

describe('_addTracingHeadersToFetchRequest', () => {
  describe('when request is a string', () => {
    describe('and no request headers are set', () => {
      it.each([
        {
          options: {},
        },
        {
          options: { headers: {} },
        },
      ])('attaches sentry headers (options: $options)', ({ options }) => {
        expect(_addTracingHeadersToFetchRequest('/api/test', options)).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: DEFAULT_BAGGAGE,
        });
      });
    });

    describe('and request headers are set in options', () => {
      it('attaches sentry headers to headers object', () => {
        expect(_addTracingHeadersToFetchRequest('/api/test', { headers: { 'custom-header': 'custom-value' } })).toEqual(
          {
            'sentry-trace': DEFAULT_SENTRY_TRACE,
            baggage: DEFAULT_BAGGAGE,
            'custom-header': 'custom-value',
          },
        );
      });

      it('attaches sentry headers to a Headers instance', () => {
        const returnedHeaders = _addTracingHeadersToFetchRequest('/api/test', {
          headers: new Headers({ 'custom-header': 'custom-value' }),
        });

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: DEFAULT_BAGGAGE,
          'custom-header': 'custom-value',
        });
      });

      it('attaches sentry headers to headers array', () => {
        const returnedHeaders = _addTracingHeadersToFetchRequest('/api/test', {
          headers: [['custom-header', 'custom-value']],
        });

        expect(Array.isArray(returnedHeaders)).toBe(true);
        expect(returnedHeaders).toEqual([
          ['custom-header', 'custom-value'],
          ['sentry-trace', DEFAULT_SENTRY_TRACE],
          ['baggage', DEFAULT_BAGGAGE],
        ]);
      });
    });

    describe('and 3rd party baggage header is set', () => {
      it('adds additional sentry baggage values to Headers instance', () => {
        const returnedHeaders = _addTracingHeadersToFetchRequest('/api/test', {
          headers: new Headers({
            baggage: 'custom-baggage=1,someVal=bar',
          }),
        });

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: `custom-baggage=1,someVal=bar,${DEFAULT_BAGGAGE}`,
        });
      });

      it('adds additional sentry baggage values to headers array', () => {
        const returnedHeaders = _addTracingHeadersToFetchRequest('/api/test', {
          headers: [['baggage', 'custom-baggage=1,someVal=bar']],
        });

        expect(Array.isArray(returnedHeaders)).toBe(true);

        expect(returnedHeaders).toEqual([
          ['baggage', 'custom-baggage=1,someVal=bar'],
          ['sentry-trace', DEFAULT_SENTRY_TRACE],
          ['baggage', DEFAULT_BAGGAGE],
        ]);
      });

      it('adds additional sentry baggage values to headers object', () => {
        const returnedHeaders = _addTracingHeadersToFetchRequest('/api/test', {
          headers: {
            baggage: 'custom-baggage=1,someVal=bar',
          },
        });

        expect(typeof returnedHeaders).toBe('object');

        expect(returnedHeaders).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: `custom-baggage=1,someVal=bar,${DEFAULT_BAGGAGE}`,
        });
      });

      it('adds additional sentry baggage values to headers object with arrays', () => {
        const returnedHeaders = _addTracingHeadersToFetchRequest('/api/test', {
          headers: {
            baggage: ['custom-baggage=1,someVal=bar', 'other-vendor-key=value'],
          },
        });

        expect(typeof returnedHeaders).toBe('object');

        expect(returnedHeaders).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: `custom-baggage=1,someVal=bar,other-vendor-key=value,${DEFAULT_BAGGAGE}`,
        });
      });
    });

    describe('and Sentry values are already set', () => {
      it('does not override them (Headers instance)', () => {
        const returnedHeaders = _addTracingHeadersToFetchRequest('/api/test', {
          headers: new Headers({
            'sentry-trace': CUSTOM_SENTRY_TRACE,
            baggage: CUSTOM_BAGGAGE,
            'custom-header': 'custom-value',
          }),
        });

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'custom-header': 'custom-value',
          'sentry-trace': CUSTOM_SENTRY_TRACE,
          baggage: CUSTOM_BAGGAGE,
        });
      });

      it('does not override them (headers array)', () => {
        const returnedHeaders = _addTracingHeadersToFetchRequest('/api/test', {
          headers: [
            ['sentry-trace', CUSTOM_SENTRY_TRACE],
            ['baggage', CUSTOM_BAGGAGE],
            ['custom-header', 'custom-value'],
          ],
        });

        expect(Array.isArray(returnedHeaders)).toBe(true);

        expect(returnedHeaders).toEqual([
          ['sentry-trace', CUSTOM_SENTRY_TRACE],
          ['baggage', CUSTOM_BAGGAGE],
          ['custom-header', 'custom-value'],
        ]);
      });

      it('does not override them (headers object)', () => {
        const returnedHeaders = _addTracingHeadersToFetchRequest('/api/test', {
          headers: {
            'sentry-trace': CUSTOM_SENTRY_TRACE,
            baggage: CUSTOM_BAGGAGE,
            'custom-header': 'custom-value',
          },
        });

        expect(typeof returnedHeaders).toBe('object');

        expect(returnedHeaders).toEqual({
          'sentry-trace': CUSTOM_SENTRY_TRACE,
          baggage: CUSTOM_BAGGAGE,
          'custom-header': 'custom-value',
        });
      });
    });
  });

  describe('when request is a Request instance', () => {
    describe('and no request headers are set', () => {
      it('attaches sentry headers', () => {
        const request = new Request('http://locahlost:3000/api/test');
        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: DEFAULT_BAGGAGE,
        });
      });
    });

    describe('and request headers are set in options', () => {
      it('attaches sentry headers to headers instance', () => {
        const request = new Request('http://locahlost:3000/api/test', {
          headers: new Headers({ 'custom-header': 'custom-value' }),
        });

        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: DEFAULT_BAGGAGE,
          'custom-header': 'custom-value',
        });
      });

      it('attaches sentry headers to headers object', () => {
        const request = new Request('http://locahlost:3000/api/test', {
          headers: { 'custom-header': 'custom-value' },
        });

        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: DEFAULT_BAGGAGE,
          'custom-header': 'custom-value',
        });
      });

      it('attaches sentry headers to headers array', () => {
        const request = new Request('http://locahlost:3000/api/test', {
          headers: [['custom-header', 'custom-value']],
        });

        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: DEFAULT_BAGGAGE,
          'custom-header': 'custom-value',
        });
      });
    });

    describe('and 3rd party baggage header is set', () => {
      it('adds additional sentry baggage values to Headers instance', () => {
        const request = new Request('http://locahlost:3000/api/test', {
          headers: new Headers({
            baggage: 'custom-baggage=1,someVal=bar',
            'custom-header': 'custom-value',
          }),
        });

        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'custom-header': 'custom-value',
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: `custom-baggage=1,someVal=bar,${DEFAULT_BAGGAGE}`,
        });
      });

      it('adds additional sentry baggage values to headers array', () => {
        const request = new Request('http://locahlost:3000/api/test', {
          headers: [['baggage', 'custom-baggage=1,someVal=bar']],
        });

        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: `custom-baggage=1,someVal=bar,${DEFAULT_BAGGAGE}`,
        });
      });

      it('adds additional sentry baggage values to headers object', () => {
        const request = new Request('http://locahlost:3000/api/test', {
          headers: {
            baggage: 'custom-baggage=1,someVal=bar',
          },
        });

        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: `custom-baggage=1,someVal=bar,${DEFAULT_BAGGAGE}`,
        });
      });

      it('adds additional sentry baggage values to headers object with arrays', () => {
        const request = new Request('http://locahlost:3000/api/test', {
          headers: {
            baggage: ['custom-baggage=1,someVal=bar', 'other-vendor-key=value'],
          },
        });

        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'sentry-trace': DEFAULT_SENTRY_TRACE,
          baggage: `custom-baggage=1,someVal=bar,other-vendor-key=value,${DEFAULT_BAGGAGE}`,
        });
      });
    });

    describe('and Sentry values are already set', () => {
      it('does not override them (Headers instance)', () => {
        const request = new Request('http://locahlost:3000/api/test', {
          headers: new Headers({
            'sentry-trace': CUSTOM_SENTRY_TRACE,
            baggage: CUSTOM_BAGGAGE,
            'custom-header': 'custom-value',
          }),
        });

        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'custom-header': 'custom-value',
          'sentry-trace': CUSTOM_SENTRY_TRACE,
          baggage: CUSTOM_BAGGAGE,
        });
      });

      it('does not override them (headers array)', () => {
        const request = new Request('http://locahlost:3000/api/test', {
          headers: [
            ['sentry-trace', CUSTOM_SENTRY_TRACE],
            ['baggage', CUSTOM_BAGGAGE],
            ['custom-header', 'custom-value'],
          ],
        });

        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'custom-header': 'custom-value',
          'sentry-trace': CUSTOM_SENTRY_TRACE,
          baggage: CUSTOM_BAGGAGE,
        });
      });

      it('does not override them (headers object)', () => {
        const request = new Request('http://locahlost:3000/api/test', {
          headers: {
            'sentry-trace': CUSTOM_SENTRY_TRACE,
            baggage: CUSTOM_BAGGAGE,
            'custom-header': 'custom-value',
          },
        });

        const returnedHeaders = _addTracingHeadersToFetchRequest(request, {});

        expect(returnedHeaders).toBeInstanceOf(Headers);

        // @ts-expect-error -- we know it's a Headers instance and entries() exists
        expect(Object.fromEntries(returnedHeaders!.entries())).toEqual({
          'custom-header': 'custom-value',
          'sentry-trace': CUSTOM_SENTRY_TRACE,
          baggage: CUSTOM_BAGGAGE,
        });
      });
    });
  });
});
