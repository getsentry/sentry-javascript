import { fileURLToPath } from 'node:url';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, dirname, join } from '@sentry/core';
import { collectInstalledModules } from '@sentry/server-utils';

/** Reads only with granted permission, so it never prompts. */
function readFile(path?: string): string | undefined {
  try {
    if (Deno.permissions.querySync({ name: 'read', path }).state === 'granted') {
      return path ? Deno.readTextFileSync(path) : Deno.cwd();
    }
  } catch {
    // not readable
  }
  return undefined;
}

/** Exact versions of the `jsr:` and `npm:` specifiers in the nearest `deno.lock` (versions 3 to 5). */
function getDenoLockModules(startDir: string): Record<string, string> {
  const modules: Record<string, string> = {};
  for (let dir = startDir, prev = ''; dir !== prev && dir !== '.'; prev = dir, dir = dirname(dir)) {
    const content = readFile(join(dir, 'deno.lock'));
    if (content) {
      try {
        const lock = JSON.parse(content) as { specifiers?: object; packages?: { specifiers?: object } };
        for (const [specifier, resolved] of Object.entries(lock.specifiers || lock.packages?.specifiers || {})) {
          const name = /^(?:npm|jsr):(@?[^@]+)@/.exec(specifier)?.[1];
          // v3 stores `npm:express@4.21.2`, later versions `4.21.2`; npm versions can end in `_<peer deps>`.
          const version = typeof resolved === 'string' && resolved.replace(/^(?:npm|jsr):@?[^@]+@/, '').split('_')[0];
          if (name && version) {
            modules[name] = version;
          }
        }
      } catch {
        // invalid lockfile
      }
      break;
    }
  }
  return modules;
}

function collectModules(): Record<string, string> {
  const entryPath = Deno.mainModule.startsWith('file:') ? fileURLToPath(Deno.mainModule) : undefined;
  const cwd = readFile();
  const modules = collectInstalledModules({ readFile, entryPath, cwd });
  const startDir = (entryPath ? dirname(entryPath.replace(/\\/g, '/')) : cwd?.replace(/\\/g, '/')) || '.';
  // Without `node_modules`, `modules` only has declared ranges, so the exact versions from `deno.lock` win.
  return { ...modules, ...getDenoLockModules(startDir) };
}

const _modulesIntegration = (() => {
  let modules: Record<string, string> | undefined;
  return {
    name: 'Modules',
    processEvent(event) {
      modules = modules || collectModules();
      event.modules = { ...event.modules, ...modules };
      return event;
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds the app's packages and versions to events, from `deno.lock` and from `package.json` and `node_modules`.
 */
export const modulesIntegration = defineIntegration(_modulesIntegration);
