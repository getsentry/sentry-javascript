import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as extensionUtils from '../../src/lambda-extension/utils';
import { spyOnExit } from './helpers';

const { main, park } = vi.hoisted(() => ({ main: vi.fn(), park: vi.fn() }));

vi.mock('../../src/lambda-extension/main', () => ({ main }));
vi.mock('../../src/lambda-extension/aws-lambda-extension', () => ({ AwsLambdaExtension: vi.fn() }));
vi.mock('../../src/lambda-extension/utils', async importOriginal => ({
  ...(await importOriginal<typeof extensionUtils>()),
  park,
}));

describe('the extension entry point', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('parks on a failure that escaped main, rather than letting the rejection end the process', async () => {
    // Nothing else is watching this promise, so an unhandled rejection ends the process — and a
    // process ending outside the shutdown phase is reported as `Extension.Crash` against the
    // invocation in flight, failing a customer request over a tunnel only this SDK would use.
    const failure = new Error('the tunnel could not listen');
    main.mockRejectedValue(failure);
    const exitSpy = spyOnExit();

    await import('../../src/lambda-extension/index');
    await vi.waitFor(() => expect(park).toHaveBeenCalled());

    expect(errorSpy).toHaveBeenCalledWith('Sentry Lambda extension: the extension stopped unexpectedly.', failure);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
