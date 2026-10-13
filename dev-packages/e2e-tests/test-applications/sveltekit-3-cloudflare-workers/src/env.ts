import { defineEnvVars } from '@sveltejs/kit/env';

// SvelteKit 3 makes "explicit environment variables" the default and removes the
// legacy `$env/*` virtual modules. Declared vars are imported from `$app/env/private`
// (server only) and `$app/env/public` (client-safe).
export const variables = defineEnvVars({
  // `static: true` inlines the value at build time. On Cloudflare there is no
  // `process.env` at runtime, so a dynamic var would never reach the SDK.
  E2E_TEST_DSN: { static: true },
  PUBLIC_E2E_TEST_DSN: { public: true, static: true },
});
