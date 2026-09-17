import { writeFileSync } from 'node:fs';

// `vite preview` takes no `--var`, and Flue resolves the provider key inside `pi-ai` at runtime
// rather than in app code Vite could inline — so the secrets are written here for the Cloudflare
// plugin to load. Gitignored; written from the environment the e2e runner provides.
writeFileSync(
  '.dev.vars',
  [
    `E2E_TEST_DSN=${process.env.E2E_TEST_DSN ?? ''}`,
    `OPENROUTER_API_KEY=${process.env.E2E_OPENROUTER_API_KEY ?? ''}`,
    '',
  ].join('\n'),
);
