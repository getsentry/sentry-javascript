import { JSDOM } from 'jsdom';
import { vi } from 'vitest';

import { isRequestCached } from '../../../src/client/vendor/lookUpCache';

globalThis.document = new JSDOM().window.document;

vi.useFakeTimers().setSystemTime(new Date('2023-06-22'));
vi.spyOn(performance, 'now').mockReturnValue(1000);

describe('isRequestCached', () => {
  it('should return true if a script tag with the same selector as the constructed request selector is found', () => {
    globalThis.document.body.innerHTML =
      '<script type="application/json" data-sveltekit-fetched data-url="/api/todos/1">{"status":200}</script>';

    expect(isRequestCached('/api/todos/1', undefined)).toBe(true);
  });

  it('should return false if a script with the same selector as the constructed request selector is not found', () => {
    globalThis.document.body.innerHTML = '';

    expect(isRequestCached('/api/todos/1', undefined)).toBe(false);
  });

  it('should return true if a script with the same selector as the constructed request selector is found and its TTL is valid', () => {
    globalThis.document.body.innerHTML =
      '<script type="application/json" data-sveltekit-fetched data-url="/api/todos/1" data-ttl="10">{"status":200}</script>';

    expect(isRequestCached('/api/todos/1', undefined)).toBe(true);
  });

  it('should return false if a script with the same selector as the constructed request selector is found and its TTL is expired', () => {
    globalThis.document.body.innerHTML =
      '<script type="application/json" data-sveltekit-fetched data-url="/api/todos/1" data-ttl="1">{"status":200}</script>';

    expect(isRequestCached('/api/todos/1', undefined)).toBe(false);
  });

  it("should return false if the TTL is set but can't be parsed as a number", () => {
    globalThis.document.body.innerHTML =
      '<script type="application/json" data-sveltekit-fetched data-url="/api/todos/1" data-ttl="notANumber">{"status":200}</script>';

    expect(isRequestCached('/api/todos/1', undefined)).toBe(false);
  });
});
