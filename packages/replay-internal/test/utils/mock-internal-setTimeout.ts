import { vi } from 'vitest';

vi.mock('@sentry-internal/browser-utils', async () => ({
  ...(await vi.importActual('@sentry-internal/browser-utils')),
  setTimeout: (...args: any[]) => {
    return setTimeout.call(global, ...args);
  },
}));
