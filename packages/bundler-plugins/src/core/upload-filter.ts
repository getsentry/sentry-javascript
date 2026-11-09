import * as path from 'path';
import { escape as escapeGlob, Ignore } from 'glob';
import type { NormalizedOptions } from './options-mapping';

export type UploadFilter = (filePath: string) => boolean;

/**
 * Mirrors the glob of the upload from disk for files that are not on disk yet: a file is
 * uploaded when it matches one of `sourcemaps.assets` (all files when unset) and none of
 * `sourcemaps.ignore`.
 */
export function createUploadFilter(options: NormalizedOptions): UploadFilter {
  const cwd = process.cwd();

  const assets = options.sourcemaps?.assets;
  // `glob` walks `assets` from the working directory, so a relative pattern is tested against
  // the full path. It skips dot files and folders unless a pattern names them.
  const matchesAssets =
    assets === undefined
      ? () => true
      : createMatcher(
          toArray(assets).map(pattern => toAbsolutePattern(cwd, pattern)),
          { cwd, dot: false },
        );

  // `glob` tests `ignore` against the path relative to the working directory, and it matches
  // dot files and folders.
  const ignore = toArray(options.sourcemaps?.ignore ?? []);
  const matchesIgnore = ignore.length === 0 ? () => false : createMatcher(ignore, { cwd, dot: true });

  return filePath => matchesAssets(filePath) && !matchesIgnore(filePath);
}

// `glob` exports the matcher behind its `ignore` option, so both options follow the rules of
// the upload from disk.
function createMatcher(patterns: string[], { cwd, dot }: { cwd: string; dot: boolean }): UploadFilter {
  const matcher = new Ignore([], { nocase: process.platform === 'darwin' || process.platform === 'win32' });
  // `Ignore` always parses in `dot: true` mode, so the option is set before the patterns are added.
  matcher.mmopts.dot = dot;
  for (const pattern of patterns) {
    matcher.add(pattern);
  }
  return filePath => {
    const fullpath = path.resolve(cwd, filePath);
    const relative = toGlobRelativePath(cwd, fullpath);
    return matcher.ignored({ fullpath: () => fullpath, relative: () => relative } as Parameters<Ignore['ignored']>[0]);
  };
}

function toAbsolutePattern(cwd: string, pattern: string): string {
  return path.isAbsolute(pattern) ? pattern : `${escapeGlob(cwd.split(path.sep).join('/'))}/${pattern}`;
}

// Like path-scurry: a file outside the working directory gets a `../` path, unless the two
// share only the file system root. Then it keeps its full path.
function toGlobRelativePath(cwd: string, fullpath: string): string {
  const relative = path.relative(cwd, fullpath);
  const levelsUp = relative.split(path.sep).filter(part => part === '..').length;
  const sharedFolder = path.resolve(cwd, ...new Array<string>(levelsUp).fill('..'));
  return levelsUp > 0 && sharedFolder === path.parse(cwd).root ? fullpath : relative;
}

function toArray(patterns: string | string[]): string[] {
  return Array.isArray(patterns) ? patterns : [patterns];
}
