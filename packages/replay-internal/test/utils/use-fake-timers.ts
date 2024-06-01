import { vi } from 'vitest';

vi.mock('@sentry-internal/browser-utils', async () => ({
  ...(await vi.importActual('@sentry-internal/browser-utils')),
  setTimeout: (...args) => {
    return setTimeout.call(global, ...args);
  },
}));

export function useFakeTimers(): void {
  vi.useFakeTimers();
}
