type ModuleInfo = Record<string, string>;
type ReadFileFn = (path: string) => string | undefined;
interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: ModuleInfo;
  devDependencies?: ModuleInfo;
}

const NODE_MODULES = '/node_modules/';

/**
 * Returns the app's packages: the dependencies declared in its `package.json`, plus loaded packages. Each gets the exact
 * version that a bare import from the entry file resolves through `node_modules`, or its declared range otherwise.
 */
export function collectInstalledModules({
  readFile,
  entryPath,
  cwd,
  loadedFiles = [],
}: {
  readFile: ReadFileFn;
  entryPath?: string;
  cwd?: string;
  /**
   * Paths of files the process has already loaded, such as the keys of `require.cache`. Packages these files belong
   * to are added too, which covers transitive dependencies that are not in `package.json`. ESM has no
   * equivalent of `require.cache`, so only CommonJS passes this; without it, only declared dependencies are resolved.
   */
  loadedFiles?: string[];
}): ModuleInfo {
  const entryDir = entryPath && dirname(toPosix(entryPath));
  const cwdDir = cwd && toPosix(cwd);
  // An entry file outside cwd usually belongs to a launcher, such as the AWS Lambda runtime.
  const appRoot = findAppRoot(
    readFile,
    entryDir && cwdDir && !isIn(entryDir, cwdDir) ? [cwdDir, entryDir] : [entryDir, cwdDir],
  );
  const resolveFrom = entryDir && appRoot && isIn(entryDir, appRoot) ? entryDir : appRoot || entryDir || cwdDir;
  const nodeModulesDirs = resolveFrom ? ancestors(resolveFrom).map(dir => join(dir, 'node_modules')) : [];
  const resolve = (name: string): string | undefined => {
    for (const dir of nodeModulesDirs) {
      const pkg = readPackageJson(readFile, join(dir, name));
      if (pkg) {
        return pkg.version;
      }
    }
    return undefined;
  };

  const pkg = appRoot ? readPackageJson(readFile, appRoot) : undefined;
  const declared: ModuleInfo = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const installed: ModuleInfo = {};

  const seen = new Set<string>();
  for (const file of loadedFiles) {
    const path = toPosix(file);
    const index = path.lastIndexOf(NODE_MODULES);
    if (index === -1 || !nodeModulesDirs.some(dir => isIn(path, dir))) {
      continue;
    }
    const base = path.slice(0, index + NODE_MODULES.length);
    const [first = '', second] = path.slice(base.length).split('/');
    const name = first.startsWith('@') ? `${first}/${second}` : first;
    if (seen.has(base + name)) {
      continue;
    }
    seen.add(base + name);
    const version = readPackageJson(readFile, base + name)?.version;
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
function findAppRoot(readFile: ReadFileFn, startDirs: Array<string | undefined>): string | undefined {
  for (const startDir of startDirs) {
    if (startDir && !`${startDir}/`.includes(NODE_MODULES)) {
      const root = ancestors(startDir).find(dir => {
        const pkg = readPackageJson(readFile, dir);
        return pkg && (pkg.name || pkg.dependencies || pkg.devDependencies);
      });
      if (root) {
        return root;
      }
    }
  }
  return undefined;
}

function readPackageJson(readFile: ReadFileFn, dir: string): PackageJson | undefined {
  try {
    return (JSON.parse(readFile(join(dir, 'package.json')) || 'null') as PackageJson | null) || undefined;
  } catch {
    return undefined;
  }
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
