/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { getBodyString } from '../src/networkUtils';

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
