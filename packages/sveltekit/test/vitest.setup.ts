import { writable } from 'svelte/store';
import { vi } from 'vitest';

export function setup() {
  // mock $app/stores because vitest can't resolve this import from SvelteKit.
  // Seems like $app/stores is only created at build time of a SvelteKit app.
  vi.mock('$app/stores', async () => {
    return {
      navigating: writable(),
      page: writable(),
    };
  });
}

if (!globalThis.fetch) {
  // @ts-expect-error - Needed for vitest to work with our fetch instrumentation
  globalThis.Request = class Request {};
  // @ts-expect-error - Needed for vitest to work with our fetch instrumentation
  globalThis.Response = class Response {};
}
