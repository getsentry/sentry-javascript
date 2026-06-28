import { defineEnvVars } from '@sveltejs/kit/hooks';

// SvelteKit 3 makes "explicit environment variables" the default and removes the
// legacy `$env/*` virtual modules. Declared vars are imported from `$app/env/private`
// (server only) and `$app/env/public` (client-safe).
export const variables = defineEnvVars({
  // `static: true` inlines the value at build time (the value is present in the
  // build environment). A dynamic private var (`{}`) currently resolves to
  // `undefined` at runtime under Kit 3's adapter-node, even though it is set in
  // `process.env` — so the DSN would never reach the server SDK.
  E2E_TEST_DSN: { static: true },
  PUBLIC_E2E_TEST_DSN: { public: true },
});
