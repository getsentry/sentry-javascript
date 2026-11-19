import { dirname, join } from './path';

/** Package names mapped to versions, as sent in `event.modules`. */
export type ModuleInfo = Record<string, string>;

/** Reads a UTF-8 file. Returns `undefined` when the file does not exist or cannot be read. */
export type ReadFileFn = (path: string) => string | undefined;

export interface CollectInstalledModulesOptions {
  readFile: ReadFileFn;
  /** Absolute path of the entry file of the app, such as `process.argv[1]`. */
  entryPath?: string;
  /** Used to find the app's `package.json` when the entry file does not lead to one. */
  cwd?: string;
  /** Absolute paths of the files that the runtime loaded, such as the keys of `require.cache`. */
  loadedFiles?: string[];
}

export interface InstalledModules {
  /** The `dependencies` and `devDependencies` of the app's `package.json`, with the version ranges as declared. */
  declared: ModuleInfo;
  /** Exact versions read from the installed `package.json` of each package. */
  installed: ModuleInfo;
}

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const NODE_MODULES_SEGMENT = '/node_modules/';

/**
 * Finds the app's `package.json` and returns each dependency it declares, plus the exact version of every package
 * that resolves from the app's `node_modules` folders.
 *
 * Packages resolve the way Node.js resolves a bare `require(name)` or `import name` from the entry file, so the
 * result is the same for CommonJS and ESM apps, and for the flat (npm, Yarn, Bun) and isolated (pnpm, Bun) layouts.
 */
export function collectInstalledModules(options: CollectInstalledModulesOptions): InstalledModules {
  const { readFile, loadedFiles = [] } = options;
  const entryDir = options.entryPath ? dirname(toPosixPath(options.entryPath)) : undefined;
  const cwd = options.cwd ? toPosixPath(options.cwd) : undefined;

  // An entry file outside the working directory usually belongs to a launcher, such as the AWS Lambda runtime.
  const appRoot = findAppRoot(readFile, entryDir && cwd && !isInDir(entryDir, cwd) ? [cwd, entryDir] : [entryDir, cwd]);
  // Resolve from the entry file when it lives in the app, so nested `node_modules` between the two are searched too.
  const resolveFrom = entryDir && appRoot && isInDir(entryDir, appRoot) ? entryDir : appRoot || entryDir || cwd;
  const nodeModulesDirs = resolveFrom ? getAncestorDirs(resolveFrom).map(dir => join(dir, 'node_modules')) : [];

  const packageJson = appRoot ? readPackageJson(readFile, appRoot) : undefined;
  const declared: ModuleInfo = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };

  const installed = getLoadedModules(readFile, loadedFiles, nodeModulesDirs);
  for (const name of Object.keys(declared)) {
    const version = resolveInstalledVersion(readFile, name, nodeModulesDirs);
    if (version) {
      installed[name] = version;
    }
  }

  return { declared, installed };
}

/**
 * Reads the exact versions of the packages in a `deno.lock` file (versions 3 to 5).
 * Returns an empty object when the content is not a lockfile that this function understands.
 */
export function parseDenoLockModules(content: string): ModuleInfo {
  let specifiers: unknown;
  try {
    const lock = JSON.parse(content) as { specifiers?: unknown; packages?: { specifiers?: unknown } };
    specifiers = lock.specifiers ?? lock.packages?.specifiers;
  } catch {
    return {};
  }

  const modules: ModuleInfo = {};
  if (!specifiers || typeof specifiers !== 'object') {
    return modules;
  }

  for (const [specifier, resolved] of Object.entries(specifiers)) {
    const name = /^(?:npm|jsr):(@?[^@]+)@/.exec(specifier)?.[1];
    if (!name || typeof resolved !== 'string') {
      continue;
    }
    // Version 3 stores the full specifier (`npm:express@4.21.2`), later versions only the version.
    // npm versions can carry a peer dependency suffix (`18.3.0_react@18.3.1`).
    const version = (resolved.includes(':') ? resolved.slice(resolved.lastIndexOf('@') + 1) : resolved).split('_')[0];
    if (version) {
      modules[name] = version;
    }
  }

  return modules;
}

/**
 * The nearest folder above one of `startDirs` that has a `package.json` for an app.
 * Skips start folders inside `node_modules` (such as the binary of `next start`) and `package.json` files that only
 * set a field such as `"type": "module"` for a build output folder.
 */
function findAppRoot(readFile: ReadFileFn, startDirs: Array<string | undefined>): string | undefined {
  for (const startDir of startDirs) {
    if (!startDir || `${startDir}/`.includes(NODE_MODULES_SEGMENT)) {
      continue;
    }
    for (const dir of getAncestorDirs(startDir)) {
      const packageJson = readPackageJson(readFile, dir);
      if (packageJson && (packageJson.name || packageJson.dependencies || packageJson.devDependencies)) {
        return dir;
      }
    }
  }
  return undefined;
}

/** The version of the package that a bare `require(name)` loads when it searches `nodeModulesDirs`. */
function resolveInstalledVersion(readFile: ReadFileFn, name: string, nodeModulesDirs: string[]): string | undefined {
  for (const dir of nodeModulesDirs) {
    const packageJson = readPackageJson(readFile, join(dir, name));
    if (packageJson) {
      return typeof packageJson.version === 'string' ? packageJson.version : undefined;
    }
  }
  return undefined;
}

/** The packages of the loaded files that live in one of `nodeModulesDirs`, including pnpm and Bun stores there. */
function getLoadedModules(readFile: ReadFileFn, loadedFiles: string[], nodeModulesDirs: string[]): ModuleInfo {
  const versionsByName: Record<string, string[]> = {};
  const seenPackageDirs = new Set<string>();

  for (const file of loadedFiles) {
    const path = toPosixPath(file);
    if (!nodeModulesDirs.some(dir => isInDir(path, dir))) {
      continue;
    }

    const packageDir = getPackageDir(path);
    if (!packageDir || seenPackageDirs.has(packageDir.dir)) {
      continue;
    }
    seenPackageDirs.add(packageDir.dir);

    const version = readPackageJson(readFile, packageDir.dir)?.version;
    if (typeof version === 'string') {
      versionsByName[packageDir.name] = [...(versionsByName[packageDir.name] || []), version];
    }
  }

  const modules: ModuleInfo = {};
  for (const [name, versions] of Object.entries(versionsByName)) {
    // pnpm and Bun stores can hold several loaded versions of one package. Prefer the one the app itself resolves.
    const appVersion = versions.length > 1 ? resolveInstalledVersion(readFile, name, nodeModulesDirs) : undefined;
    modules[name] = appVersion && versions.includes(appVersion) ? appVersion : (versions[0] as string);
  }
  return modules;
}

/** The innermost `node_modules/<name>` or `node_modules/@scope/<name>` folder that contains `path`. */
function getPackageDir(path: string): { name: string; dir: string } | undefined {
  const index = path.lastIndexOf(NODE_MODULES_SEGMENT);
  if (index === -1) {
    return undefined;
  }
  const base = path.slice(0, index + NODE_MODULES_SEGMENT.length);
  const [first, second] = path.slice(base.length).split('/');
  const name = first?.startsWith('@') && second ? `${first}/${second}` : first;
  return name ? { name, dir: base + name } : undefined;
}

function readPackageJson(readFile: ReadFileFn, dir: string): PackageJson | undefined {
  const content = readFile(join(dir, 'package.json'));
  if (!content) {
    return undefined;
  }
  try {
    const packageJson = JSON.parse(content) as PackageJson | null;
    return packageJson && typeof packageJson === 'object' ? packageJson : undefined;
  } catch {
    return undefined;
  }
}

function getAncestorDirs(dir: string): string[] {
  const dirs = [dir];
  for (
    let parent = dirname(dir);
    parent && parent !== '.' && parent !== dirs[dirs.length - 1];
    parent = dirname(parent)
  ) {
    dirs.push(parent);
  }
  return dirs;
}

function isInDir(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith('/') ? dir : `${dir}/`);
}

function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/');
}
