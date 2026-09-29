import { afterEach, expect, test, vi } from 'vitest';
import { AwsLambdaExtension } from '../src/lambda-extension/aws-lambda-extension';

afterEach(() => {
  vi.restoreAllMocks();
});

test('logs polling failures and exits instead of leaving the tunnel running', async () => {
  const error = new Error('Extension API connection failed');
  vi.spyOn(AwsLambdaExtension.prototype, 'register').mockResolvedValue();
  vi.spyOn(AwsLambdaExtension.prototype, 'startSentryTunnel').mockImplementation(() => {});
  vi.spyOn(AwsLambdaExtension.prototype, 'next').mockRejectedValue(error);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

  await import('../src/lambda-extension/index');

  await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  expect(log).toHaveBeenCalledWith('Error in Lambda Extension', error);
});
