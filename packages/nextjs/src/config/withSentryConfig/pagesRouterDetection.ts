import * as fs from 'fs';
import * as path from 'path';

/**
 * Whether the project has an `app` directory and no page files outside `pages/api`.
 *
 * A false positive would silently drop Pages Router navigation spans, so any file outside `pages/api` counts as a
 * page (covers custom `pageExtensions` and `_app`/`_document`), and no `app` directory means `false`.
 */
export function hasOnlyAppRouterPages(projectDir: string): boolean {
  const hasAppDir = ['app', path.join('src', 'app')].some(dir => isDirectory(path.join(projectDir, dir)));
  if (!hasAppDir) {
    return false;
  }

  return ['pages', path.join('src', 'pages')].every(dir => !containsNonApiPages(path.join(projectDir, dir)));
}

function containsNonApiPages(pagesDir: string): boolean {
  if (!isDirectory(pagesDir)) {
    return false;
  }

  return fs.readdirSync(pagesDir).some(entry => entry !== 'api');
}

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
