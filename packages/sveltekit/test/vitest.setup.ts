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
  // @ts-ignore dfsf
  globalThis.Request = class Request {};
}
console.log(globalThis.fetch, globalThis.Response, globalThis.Request);
