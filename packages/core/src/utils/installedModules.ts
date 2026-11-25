type ModuleInfo = Record<string, string>;
interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: ModuleInfo;
  devDependencies?: ModuleInfo;
}

const NODE_MODULES = '/node_modules/';

/**
 * Returns the app's packages: the dependencies declared in its `package.json`, plus loaded packages. Each gets the exact
 * version that a bare import from the app resolves through `node_modules`, or its declared range otherwise.
 */
export function collectInstalledModules({
  readFile,
  entryPath,
  cwd,
  loadedFiles = [],
}: {
  readFile: (path: string) => string | undefined;
  entryPath?: string;
  cwd?: string;
  /**
   * Paths of files the process has already loaded, such as the keys of the CommonJS module cache. Packages these files
   * belong to are added too, which covers transitive dependencies that are not in `package.json`.
   */
  loadedFiles?: string[];
}): ModuleInfo {
  const read = (dir: string): PackageJson | undefined => {
    try {
      return JSON.parse(readFile(join(dir, 'package.json')) || 'null') || undefined;
    } catch {
      return undefined;
    }
  };

  const entryDir = entryPath && dirname(toPosix(entryPath));
  const cwdDir = cwd && toPosix(cwd);
  // An entry file outside cwd usually belongs to a launcher, such as the AWS Lambda runtime.
  const appRoot = findAppRoot(
    read,
    entryDir && cwdDir && !isIn(entryDir, cwdDir) ? [cwdDir, entryDir] : [entryDir, cwdDir],
  );

  const resolveFrom =
    entryDir && appRoot && isIn(entryDir, appRoot) && !inNodeModules(entryDir)
      ? entryDir
      : appRoot || entryDir || cwdDir;
  const nodeModulesDirs = resolveFrom ? ancestors(resolveFrom).map(dir => join(dir, 'node_modules')) : [];
  const resolve = (name: string): string | undefined => {
    for (const dir of nodeModulesDirs) {
      const version = read(join(dir, name))?.version;
      if (version) {
        return version;
      }
    }
    return undefined;
  };

  const pkg = appRoot ? read(appRoot) : undefined;
  const declared: ModuleInfo = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const installed: ModuleInfo = {};
  const seen = new Set<string>();

  for (const file of loadedFiles) {
    const path = toPosix(file);
    const start = path.lastIndexOf(NODE_MODULES) + NODE_MODULES.length;
    const [first = '', second] = path.slice(start).split('/');
    const name = first.startsWith('@') ? `${first}/${second}` : first;
    const dir = path.slice(0, start) + name;
    if (start < NODE_MODULES.length || seen.has(dir) || !nodeModulesDirs.some(d => isIn(path, d))) {
      continue;
    }
    seen.add(dir);
    const version = read(dir)?.version;
    if (version && installed[name] !== version) {
      // pnpm and Bun stores can hold several versions of a package; prefer the one the app resolves.
      installed[name] = (name in installed && resolve(name)) || installed[name] || version;
    }
  }

  for (const name of Object.keys(declared)) {
    const version = resolve(name);
    if (version) {
      installed[name] = version;
    }
  }

  return { ...declared, ...installed };
}

/** Skips start dirs inside `node_modules` and `package.json` files that only set fields like `"type"`. */
function findAppRoot(
  read: (dir: string) => PackageJson | undefined,
  startDirs: Array<string | undefined>,
): string | undefined {
  for (const startDir of startDirs) {
    const root =
      startDir && !inNodeModules(startDir)
        ? ancestors(startDir).find(dir => {
            const pkg = read(dir);
            return pkg && (pkg.name || pkg.dependencies || pkg.devDependencies);
          })
        : undefined;
    if (root) {
      return root;
    }
  }
  return undefined;
}

function inNodeModules(dir: string): boolean {
  return `${dir}/`.includes(NODE_MODULES);
}

/** `dir` and its parents, up to the root. */
function ancestors(dir: string): string[] {
  const dirs = [dir];
  for (let parent = dirname(dir); parent !== dirs[dirs.length - 1]; parent = dirname(parent)) {
    dirs.push(parent);
  }
  return dirs;
}

// Minimal POSIX helpers: all paths are converted with `toPosix` first.
function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : index === 0 ? '/' : path;
}

function join(dir: string, name: string): string {
  return dir.endsWith('/') ? dir + name : `${dir}/${name}`;
}

function isIn(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith('/') ? dir : `${dir}/`);
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}
