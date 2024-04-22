import { clearCachedImplementation, setCachedImplementation } from '@sentry-internal/browser-utils';

export function useFakeTimers(): void {
  clearCachedImplementation('setTimeout');
  const _setInterval = setInterval;
  const _clearInterval = clearInterval;
  jest.useFakeTimers();

  setCachedImplementation('setTimeout', window.setTimeout.bind(window));

  let interval: any;
  beforeAll(function () {
    interval = _setInterval(() => jest.advanceTimersByTime(20), 20);
  });

  afterAll(function () {
    _clearInterval(interval);
  });
}
