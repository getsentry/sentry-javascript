import { fileURLToPath } from 'node:url';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, dirname, join } from '@sentry/core';
import { _INTERNAL_collectInstalledModules, _INTERNAL_parseDenoLockModules } from '@sentry/core/server';

const INTEGRATION_NAME = 'Modules' as const;

/** Never prompts: a read without permission is skipped instead. */
function canRead(path?: string): boolean {
  try {
    return Deno.permissions.querySync(path ? { name: 'read', path } : { name: 'read' }).state === 'granted';
  } catch {
    return false;
  }
}

function readFile(path: string): string | undefined {
  if (!canRead(path)) {
    return undefined;
  }
  try {
    return Deno.readTextFileSync(path);
  } catch {
    return undefined;
  }
}

function getEntryPath(): string | undefined {
  try {
    return Deno.mainModule.startsWith('file:') ? fileURLToPath(Deno.mainModule) : undefined;
  } catch {
    return undefined;
  }
}

function getCwd(): string | undefined {
  if (!canRead()) {
    return undefined;
  }
  try {
    return Deno.cwd();
  } catch {
    return undefined;
  }
}

/** The packages in the nearest `deno.lock` above `startDir`, which covers `jsr:` and `npm:` specifiers. */
function getDenoLockModules(startDir: string): Record<string, string> {
  let previous: string | undefined;
  for (let dir = startDir; dir && dir !== '.' && dir !== previous; dir = dirname(dir)) {
    const content = readFile(join(dir, 'deno.lock'));
    if (content) {
      return _INTERNAL_parseDenoLockModules(content);
    }
    previous = dir;
  }
  return {};
}

function collectModules(): Record<string, string> {
  const entryPath = getEntryPath();
  const cwd = getCwd();
  const { declared, installed } = _INTERNAL_collectInstalledModules({ readFile, entryPath, cwd });
  const startDir = entryPath ? dirname(entryPath.replace(/\\/g, '/')) : cwd?.replace(/\\/g, '/');

  return {
    ...declared,
    ...(startDir ? getDenoLockModules(startDir) : {}),
    ...installed,
  };
}

const _modulesIntegration = (() => {
  let modules: Record<string, string> | undefined;

  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      if (!modules) {
        modules = collectModules();
      }
      event.modules = {
        ...event.modules,
        ...modules,
      };
      return event;
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds the packages of the app and their versions to the event.
 *
 * The versions come from the nearest `deno.lock` (for `jsr:` and `npm:` specifiers) and from the `package.json` and
 * `node_modules` of the app, if it has them. Files are only read with read permission, so this never prompts.
 */
export const modulesIntegration = defineIntegration(_modulesIntegration);
