import { loadModule, logger } from '@sentry/utils';
import { cwd } from 'process';
import { DEBUG_BUILD } from './debug-build';
import type { ReactRouterDomPkg } from './vendor/types';

function hasMatchRoutes(pkg: ReactRouterDomPkg | undefined): boolean {
  return !!pkg && typeof pkg.matchRoutes === 'function';
}

/**
 * Loads the router package that provides matchRoutes.
 * Tries loading @remix-run/router first, then falls back to react-router-dom.
 */
export async function loadRemixRouterModule(): Promise<ReactRouterDomPkg | undefined> {
  // Try loading @remix-run/router first, then fall back to react-router-dom
  for (const moduleName of ['@remix-run/router', 'react-router-dom']) {
    const pkg = await tryLoadRouterModule(moduleName);

    if (pkg) {
      return pkg;
    }
  }

  DEBUG_BUILD && logger.warn('Could not find a router package that provides `matchRoutes`.');

  return;
}

async function tryLoadRouterModule(moduleName: string): Promise<ReactRouterDomPkg | undefined> {
  let pkg: ReactRouterDomPkg | undefined;

  pkg = loadModule<ReactRouterDomPkg>(moduleName);

  if (hasMatchRoutes(pkg)) {
    return pkg;
  }

  try {
    pkg = await import(moduleName);
  } catch (e) {
    pkg = await import(`${cwd()}/node_modules/${moduleName}`);
  }

  if (hasMatchRoutes(pkg)) {
    return pkg;
  } else {
    DEBUG_BUILD && logger.warn(`Could not find ${moduleName} package.`);
  }

  return;
}
