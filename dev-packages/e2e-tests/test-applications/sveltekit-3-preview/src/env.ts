import { defineEnvVars } from '@sveltejs/kit/hooks';

export const variables = defineEnvVars({
  PUBLIC_E2E_TEST_DSN: {
    public: true,
  },
});
