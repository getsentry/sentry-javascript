import { globSync, rmSync } from 'node:fs';

// `fs.globSync` needs Node 22. This is a local helper, and the repo pins Node 24 in `devEngines`.
for (const path of globSync(['suites/**/dist', 'loader-suites/**/dist', 'tmp'])) {
  rmSync(path, { recursive: true, force: true });
}
