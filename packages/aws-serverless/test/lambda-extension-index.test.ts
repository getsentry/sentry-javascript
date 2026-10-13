import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function setupExtension() {
  const { AwsLambdaExtension } = await import('../src/lambda-extension/aws-lambda-extension');
  vi.spyOn(AwsLambdaExtension.prototype, 'register').mockResolvedValue();
  vi.spyOn(AwsLambdaExtension.prototype, 'startSentryTunnel').mockImplementation(() => {});
  const next = vi.spyOn(AwsLambdaExtension.prototype, 'next').mockImplementation(() => new Promise(() => {}));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  return { next, log, exit };
}

test.each(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN'])(
  'recovers from %s without exiting',
  async code => {
    const { next, exit, log } = await setupExtension();
    next.mockRejectedValueOnce(Object.assign(new Error('Connection failed'), { code })).mockResolvedValueOnce();

    const { POLL_RETRY_DELAYS } = await import('../src/lambda-extension/index');
    await vi.advanceTimersByTimeAsync(0);
    expect(next).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_RETRY_DELAYS[0] - 1);
    expect(next).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(next).toHaveBeenCalledTimes(3);
    expect(exit).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  },
);

test('logs and exits after exhausting consecutive connection retries', async () => {
  const { next, exit, log } = await setupExtension();
  const error = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
  const attempts: number[] = [];
  next.mockImplementation(async () => {
    attempts.push(Date.now());
    throw error;
  });

  const { POLL_RETRY_DELAYS } = await import('../src/lambda-extension/index');
  const retryBudget = POLL_RETRY_DELAYS.reduce((total, delay) => total + delay, 0);
  await vi.advanceTimersByTimeAsync(retryBudget - 1);
  expect(exit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);

  expect(attempts).toEqual([0, POLL_RETRY_DELAYS[0], POLL_RETRY_DELAYS[0] + POLL_RETRY_DELAYS[1], retryBudget]);
  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(log).toHaveBeenCalledExactlyOnceWith('Error in Lambda Extension', error);
  expect(vi.getTimerCount()).toBe(0);
});

test('resets the retry budget after a successful poll', async () => {
  const { next, exit } = await setupExtension();
  const error = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
  next
    .mockRejectedValueOnce(error)
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(error)
    .mockRejectedValueOnce(error)
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce();

  const { POLL_RETRY_DELAYS } = await import('../src/lambda-extension/index');
  const retryBudget = POLL_RETRY_DELAYS.reduce((total, delay) => total + delay, 0);
  await vi.advanceTimersByTimeAsync(POLL_RETRY_DELAYS[0] + POLL_RETRY_DELAYS[1] + retryBudget);

  expect(next).toHaveBeenCalledTimes(8);
  expect(exit).not.toHaveBeenCalled();
});

test.each([
  new Error('Failed to advance to next event: Forbidden'),
  new Error('Failed to advance to next event: Container error'),
  Object.assign(new Error('Invalid URL'), { code: 'ERR_INVALID_URL' }),
])('logs and exits immediately for $message', async error => {
  const { next, log, exit } = await setupExtension();
  next.mockRejectedValue(error);

  await import('../src/lambda-extension/index');
  await vi.advanceTimersByTimeAsync(0);

  expect(next).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(log).toHaveBeenCalledExactlyOnceWith('Error in Lambda Extension', error);
  expect(vi.getTimerCount()).toBe(0);
});
