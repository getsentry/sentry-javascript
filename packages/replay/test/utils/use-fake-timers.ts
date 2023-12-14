export function useFakeTimers(): void {
  const _setInterval = setInterval;
  const _clearInterval = clearInterval;
  jest.useFakeTimers();

  let interval: any;
  beforeAll(() => {
    interval = _setInterval(() => jest.advanceTimersByTime(20), 20);
  });

  afterAll(() => {
    _clearInterval(interval);
  });
}
