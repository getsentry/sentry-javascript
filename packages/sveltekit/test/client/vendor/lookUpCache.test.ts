import * as utils from '@sentry/utils';
import { vi } from 'vitest';

import { isRequestCached } from '../../../src/client/vendor/lookUpCache';

let scriptElement: {
  textContent: string;
  getAttribute: (name: string) => string | null;
} | null;

vi.spyOn(utils, 'getDomElement').mockImplementation(() => {
  return scriptElement;
});

describe('isRequestCached', () => {
  it('should return true if a script tag with the same selector as the constructed request selector is found', () => {
    scriptElement = {
      textContent: 'test',
      getAttribute: () => null,
    };

    expect(isRequestCached('/api/todos/1', undefined)).toBe(true);
  });

  it('should return false if a script with the same selector as the constructed request selector is not found', () => {
    scriptElement = null;

    expect(isRequestCached('/api/todos/1', undefined)).toBe(false);
  });

  it('should return true if a script with the same selector as the constructed request selector is found and its TTL is valid', () => {
    scriptElement = {
      textContent: 'test',
      getAttribute: () => (performance.now() / 1000 + 1).toString(),
    };

    expect(isRequestCached('/api/todos/1', undefined)).toBe(true);
  });

  it('should return false if a script with the same selector as the constructed request selector is found and its TTL is expired', () => {
    scriptElement = {
      textContent: 'test',
      getAttribute: () => (performance.now() / 1000 - 1).toString(),
    };

    expect(isRequestCached('/api/todos/1', undefined)).toBe(false);
  });

  it("should return false if the TTL is set but can't be parsed", () => {
    scriptElement = {
      textContent: 'test',
      getAttribute: () => 'NotANumber',
    };

    expect(isRequestCached('/api/todos/1', undefined)).toBe(false);
  });

  it('should return false if an error was thrown turing TTL evaluation', () => {
    scriptElement = {
      textContent: 'test',
      getAttribute: () => {
        throw new Error('test');
      },
    };

    expect(isRequestCached('/api/todos/1', undefined)).toBe(false);
  });
});
