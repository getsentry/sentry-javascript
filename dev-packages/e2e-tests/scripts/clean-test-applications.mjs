import { globSync, rmSync } from 'node:fs';

const pattern =
  'test-applications/**/{node_modules,dist,build,.next,.nuxt,.sveltekit,.react-router,.astro,.output,pnpm-lock.yaml,.last-run.json,test-results,.angular}';

for (const path of globSync(pattern)) {
  rmSync(path, { recursive: true, force: true });
}
