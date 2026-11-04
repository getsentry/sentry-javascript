// The server test routes under `apiPrefix` are copies of each other that differ only in where they import from.
// Reference: https://github.com/nuxt/nuxt/pull/36275
export const IMPORT_SURFACES = [
  { name: '#imports', apiPrefix: '/api' },
  { name: 'nuxt/server', apiPrefix: '/api/nuxt-server' },
] as const;
