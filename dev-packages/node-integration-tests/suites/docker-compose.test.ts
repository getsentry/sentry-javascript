import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { expect, test } from 'vitest';
import { parse } from 'yaml';

function findComposeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name.startsWith('tmp_')
        ? []
        : findComposeFiles(join(dir, entry.name));
    }
    return entry.name === 'docker-compose.yml' ? [join(dir, entry.name)] : [];
  });
}

const composeFiles = findComposeFiles(__dirname);

// `up --wait` returns as soon as a service without a healthcheck has started, so the test would race
// the service's startup.
test.each(composeFiles.map(file => relative(__dirname, file)))('every service in %s has a healthcheck', file => {
  const config = parse(readFileSync(join(__dirname, file), 'utf8')) as {
    services?: Record<string, { healthcheck?: { test?: string | string[]; disable?: boolean } } | null>;
  };

  const missing = Object.entries(config.services ?? {})
    .filter(([, service]) => {
      const healthcheck = service?.healthcheck;
      const command = [healthcheck?.test ?? []].flat();
      return healthcheck?.disable === true || !command[0] || command[0] === 'NONE';
    })
    .map(([name]) => name);

  expect(missing).toEqual([]);
});

test('finds the docker-compose files', () => {
  expect(composeFiles.length).toBeGreaterThan(0);
});
