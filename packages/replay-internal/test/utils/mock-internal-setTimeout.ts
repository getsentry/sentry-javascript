import { vi } from 'vitest';

vi.mock('@sentry/browser-utils', async () => ({
  ...(await vi.importActual('@sentry/browser-utils')),
  setTimeout: (...args: any[]) => {
    return setTimeout.call(global, ...args);
  },
}));
