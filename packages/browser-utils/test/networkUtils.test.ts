/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { getBodyString, getFetchRequestArgBody, ORIGINAL_REQ_BODY, serializeFormData } from '../src/networkUtils';

describe('getBodyString', () => {
  it('works with a string', () => {
    const actual = getBodyString('abc');
    expect(actual).toEqual(['abc']);
  });

  it('works with URLSearchParams', () => {
    const body = new URLSearchParams();
    body.append('name', 'Anne');
    body.append('age', '32');
    const actual = getBodyString(body);
    expect(actual).toEqual(['name=Anne&age=32']);
  });

  it('works with FormData', () => {
    const body = new FormData();
    body.append('name', 'Anne');
    body.append('age', '32');
    const actual = getBodyString(body);
    expect(actual).toEqual(['name=Anne&age=32']);
  });

  it('works with empty  data', () => {
    const body = undefined;
    const actual = getBodyString(body);
    expect(actual).toEqual([undefined]);
  });

  it('works with other type of data', () => {
    const body = {};
    const actual = getBodyString(body);
    expect(actual).toEqual([undefined, 'UNPARSEABLE_BODY_TYPE']);
  });
});

describe('getFetchRequestArgBody', () => {
  describe('valid types of body', () => {
    it('works with json string', () => {
      const body = { data: [1, 2, 3] };
      const jsonBody = JSON.stringify(body);

      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body: jsonBody }]);
      expect(actual).toEqual(jsonBody);
    });

    it('works with URLSearchParams', () => {
      const body = new URLSearchParams();
      body.append('name', 'Anne');
      body.append('age', '32');

      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });

    it('works with FormData', () => {
      const body = new FormData();
      body.append('name', 'Bob');
      body.append('age', '32');

      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });

    it('works with Blob', () => {
      const body = new Blob(['example'], { type: 'text/plain' });
      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });

    it('works with BufferSource (ArrayBufferView | ArrayBuffer)', () => {
      const body = new Uint8Array([1, 2, 3]);
      const actual = getFetchRequestArgBody(['http://example.com', { method: 'POST', body }]);
      expect(actual).toEqual(body);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it.each([
      ['empty array', [], undefined],
      ['no arguments', undefined, undefined],
      [
        'second arg is object without body property',
        ['http://example.com', { method: 'POST', headers: {} }],
        undefined,
      ],
      ['second arg has body: null', ['http://example.com', { body: null }], null],
      ['second arg has body: undefined', ['http://example.com', { body: undefined }], undefined],
      ['second arg has body: 0', ['http://example.com', { body: 0 as any }], 0],
      ['second arg has body: false', ['http://example.com', { body: false as any }], false],
      ['second arg is not an object', ['http://example.com', 'not-an-object'], undefined],
      ['second arg is null', ['http://example.com', null], undefined],
      [
        'arguments beyond the second one',
        ['http://example.com', { body: 'correct' }, { body: 'ignored' }] as any,
        'correct',
      ],
    ])('returns correct value when %s', (_name, args, expected) => {
      const actual = getFetchRequestArgBody(args);
      expect(actual).toBe(expected);
    });
  });

  describe('does not work without body passed as the second option', () => {
    it.each([
      ['string URL only', ['http://example.com']],
      ['URL object only', [new URL('http://example.com')]],
      ['Request URL only', [{ url: 'http://example.com' }]],
      ['body in first arg', [{ url: 'http://example.com', method: 'POST', body: JSON.stringify({ data: [1, 2, 3] }) }]],
    ])('%s', (_name, args) => {
      const actual = getFetchRequestArgBody(args);

      expect(actual).toBeUndefined();
    });
  });

  describe('works with Request object as first argument (patched Symbol on Request)', () => {
    // Some integrations (e.g. Replay) patch the Request object to store the original body
    const addOriginalBodySymbol = (request: Request, body: any): Request => {
      (request as any)[ORIGINAL_REQ_BODY] = body;
      return request;
    };

    it.each([
      [
        'Request object with body (as only arg)',
        [addOriginalBodySymbol(new Request('http://example.com', { method: 'POST', body: 'Hello' }), 'Hello')],
        'Hello',
      ],
      [
        'Request object with body (with undefined options arg)',
        [
          addOriginalBodySymbol(new Request('http://example.com', { method: 'POST', body: 'World' }), 'World'),
          undefined,
        ],
        'World',
      ],
      [
        'Request object with body (with overwritten options arg)',
        [
          addOriginalBodySymbol(new Request('http://example.com', { method: 'POST', body: 'First' }), 'First'),
          { body: 'Override' },
        ],
        'Override',
      ],
      [
        'prioritizes second arg body even when it is null',
        [
          addOriginalBodySymbol(new Request('http://example.com', { method: 'POST', body: 'original' }), 'First'),
          { body: null },
        ],
        null,
      ],
    ])('%s', (_name, args, expected) => {
      const actual = getFetchRequestArgBody(args);

      expect(actual).toBe(expected);
    });

    describe('valid types of body (in Request)', () => {
      it('works with json string', () => {
        const body = { data: [1, 2, 3] };
        const jsonBody = JSON.stringify(body);

        const actual = getFetchRequestArgBody([
          addOriginalBodySymbol(new Request('http://example.com', { method: 'POST', body: jsonBody }), jsonBody),
        ]);
        expect(actual).toEqual(jsonBody);
      });

      it('works with URLSearchParams', () => {
        const body = new URLSearchParams();
        body.append('name', 'Anne');
        body.append('age', '32');

        const actual = getFetchRequestArgBody([
          addOriginalBodySymbol(new Request('http://example.com', { method: 'POST', body }), body),
        ]);
        expect(actual).toEqual(body);
      });

      it('works with FormData', () => {
        const body = new FormData();
        body.append('name', 'Bob');
        body.append('age', '32');

        const actual = getFetchRequestArgBody([
          addOriginalBodySymbol(new Request('http://example.com', { method: 'POST', body }), body),
        ]);
        expect(actual).toEqual(body);
      });

      it('works with Blob', () => {
        const body = new Blob(['example'], { type: 'text/plain' });

        const actual = getFetchRequestArgBody([
          addOriginalBodySymbol(new Request('http://example.com', { method: 'POST', body }), body),
        ]);
        expect(actual).toEqual(body);
      });

      it('works with BufferSource (ArrayBufferView | ArrayBuffer)', () => {
        const body = new Uint8Array([1, 2, 3]);

        const actual = getFetchRequestArgBody([
          addOriginalBodySymbol(new Request('http://example.com', { method: 'POST', body }), body),
        ]);
        expect(actual).toEqual(body);
      });

      it('works with ReadableStream', () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('stream data'));
            controller.close();
          },
        });
        const request = new Request('http://example.com', {
          method: 'POST',
          body: stream,
          // @ts-expect-error - Required for streaming requests https://developer.mozilla.org/en-US/docs/Web/API/Request/duplex
          duplex: 'half',
        });

        const actual = getFetchRequestArgBody([addOriginalBodySymbol(request, stream)]);
        expect(actual).toBe(stream);
      });
    });
  });
});

describe('serializeFormData', () => {
  it('works with FormData', () => {
    const formData = new FormData();
    formData.append('name', 'Anne Smith');
    formData.append('age', '13');

    const actual = serializeFormData(formData);
    expect(actual).toBe('name=Anne+Smith&age=13');
  });
});
