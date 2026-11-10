import { globSync, rmSync } from 'node:fs';

for (const path of globSync(['suites/**/dist', 'loader-suites/**/dist', 'tmp'])) {
  rmSync(path, { recursive: true, force: true });
}
