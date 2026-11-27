import { defineConfig } from 'void/config';

export default defineConfig({
  worker: {
    compatibility_date: '2026-11-01',
    compatibility_flags: ['nodejs_compat'],
    vars: {
      E2E_TEST_DSN: process.env.E2E_TEST_DSN,
    },
  },
});
