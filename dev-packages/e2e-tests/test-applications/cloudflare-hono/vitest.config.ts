import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersProject(() => {
  return {
    test: {
      globals: true,
      poolOptions: {
        workers: { wrangler: { configPath: './wrangler.toml' } },
      },
    },
  };
});
