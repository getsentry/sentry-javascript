/* eslint-disable @typescript-eslint/unbound-method */
import type * as SentryBrowser from '@sentry/browser';
import { createTransport, getCurrentScope, setCurrentClient } from '@sentry/core';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { ErrorBoundary } from 'solid-js';
import { BrowserClient, withSentryErrorBoundary } from '../../src/client';

const mockCaptureException = vi.fn();
vi.mock('@sentry/browser', async () => {
  const actual = await vi.importActual<typeof SentryBrowser>('@sentry/browser');
  return {
    ...actual,
    captureException: (...args) => mockCaptureException(...args),
  } as typeof SentryBrowser;
});

const user = userEvent.setup();
const SentryErrorBoundary = withSentryErrorBoundary(ErrorBoundary);

describe('withSentryErrorBoundary', () => {
  function createMockBrowserClient(): BrowserClient {
    return new BrowserClient({
      integrations: [],
      tracesSampleRate: 1,
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();

    const client = createMockBrowserClient();
    setCurrentClient(client);
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('calls `captureException` when an error occurs`', () => {
    render(() => (
      <SentryErrorBoundary fallback={<div>Ooops, an error occurred.</div>}>
        {/* @ts-expect-error: component doesn't exist on purpose */}
        <NonExistentComponent />
      </SentryErrorBoundary>
    ));

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenLastCalledWith(new ReferenceError('NonExistentComponent is not defined'));
  });

  it('renders the fallback component', async () => {
    const { findByText } = render(() => (
      <SentryErrorBoundary fallback={<div>Ooops, an error occurred.</div>}>
        {/* @ts-expect-error: component doesn't exist on purpose */}
        <NonExistentComponent />
      </SentryErrorBoundary>
    ));

    expect(await findByText('Ooops, an error occurred.')).toBeInTheDocument();
  });

  it('passes the `error` and `reset` function to the fallback component', () => {
    const mockFallback = vi.fn();

    render(() => (
      <SentryErrorBoundary fallback={mockFallback}>
        {/* @ts-expect-error: component doesn't exist on purpose */}
        <NonExistentComponent />
      </SentryErrorBoundary>
    ));

    expect(mockFallback).toHaveBeenCalledTimes(1);
    expect(mockFallback).toHaveBeenCalledWith(
      new ReferenceError('NonExistentComponent is not defined'),
      expect.any(Function),
    );
  });

  it('calls `captureException` again after resetting', async () => {
    const { findByRole } = render(() => (
      <SentryErrorBoundary fallback={(_, reset) => <button onClick={reset}>Reset</button>}>
        {/* @ts-expect-error: component doesn't exist on purpose */}
        <NonExistentComponent />
      </SentryErrorBoundary>
    ));

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenNthCalledWith(1, new ReferenceError('NonExistentComponent is not defined'));

    const button = await findByRole('button');
    await user.click(button);

    expect(mockCaptureException).toHaveBeenCalledTimes(2);
    expect(mockCaptureException).toHaveBeenNthCalledWith(2, new ReferenceError('NonExistentComponent is not defined'));
  });

  it('renders children when there is no error', async () => {
    const { queryByText } = render(() => (
      <SentryErrorBoundary fallback={<div>Oops, an error occurred.</div>}>
        <div>Adopt a cat</div>
      </SentryErrorBoundary>
    ));

    expect(await queryByText('Adopt a cat')).toBeInTheDocument();
    expect(await queryByText('Ooops, an error occurred')).not.toBeInTheDocument();
  });
});
