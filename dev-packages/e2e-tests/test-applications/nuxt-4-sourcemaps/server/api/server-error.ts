import { defineEventHandler } from '#imports';

// SOURCEMAP_MARKER_SERVER — the server counterpart of the client marker. Nitro defaults to
// `sourcemapExcludeSources: true`, which would drop this from the uploaded map; the Sentry module
// flips it to `false`, so finding this marker in `sourcesContent` is what proves that still works.
export default defineEventHandler(() => {
  throw new Error('Server error from the Nuxt source map E2E app');
});
