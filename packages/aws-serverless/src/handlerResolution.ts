import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ParsedHandler {
  /** Directory portion of the handler string, e.g. `src/` for `src/index.handler`. */
  moduleRoot: string;
  /** Module file name without extension, e.g. `index` for `src/index.handler`. */
  moduleName: string;
  /** Export path within the module, e.g. `handler` or `nested.handler`. */
  functionPath: string;
}

/**
 * Parses a Lambda handler string (`<module-root>/<module>.<function-path>`) the same way
 * the AWS Lambda runtime interface client does: the module name is the part of the
 * basename up to the first dot, the function path is everything after it (and may itself
 * contain dots for nested exports).
 *
 * @see https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/main/src/UserFunction.js
 */
export function parseHandlerString(handlerString: string): ParsedHandler | undefined {
  const basename = path.basename(handlerString);
  const moduleRoot = handlerString.substring(0, handlerString.length - basename.length);

  const match = basename.match(/^([^.]*)\.(.*)$/);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return { moduleRoot, moduleName: match[1], functionPath: match[2] };
}

export interface ResolvedHandlerFile {
  file: string;
  format: 'cjs' | 'esm';
}

/**
 * Resolves the handler module to a concrete file, mirroring the AWS Lambda runtime's
 * probing order: extensionless file, then `.js` (ESM only when the nearest `package.json`
 * declares `"type": "module"`), then `.mjs`, then `.cjs`.
 *
 * Extensionless files are always CJS: the runtime `require()`s them unconditionally,
 * before its `"type": "module"` check (which only affects `.js` files), and Node cannot
 * `import()` a file without an extension anyway.
 */
export function resolveHandlerFile(
  taskRoot: string,
  moduleRoot: string,
  moduleName: string,
): ResolvedHandlerFile | undefined {
  const basePath = path.resolve(taskRoot, moduleRoot, moduleName);

  if (isFile(basePath)) {
    return { file: basePath, format: 'cjs' };
  }
  if (isFile(`${basePath}.js`)) {
    return { file: `${basePath}.js`, format: hasTypeModulePackageJson(path.dirname(basePath)) ? 'esm' : 'cjs' };
  }
  if (isFile(`${basePath}.mjs`)) {
    return { file: `${basePath}.mjs`, format: 'esm' };
  }
  if (isFile(`${basePath}.cjs`)) {
    return { file: `${basePath}.cjs`, format: 'cjs' };
  }

  return undefined;
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Walks up from `dir` looking for the nearest `package.json`, mirroring the AWS runtime's
 * ESM detection. The walk stops at the filesystem root or a `node_modules` boundary.
 */
function hasTypeModulePackageJson(dir: string): boolean {
  let current = dir;
  while (true) {
    const packageJsonPath = path.join(current, 'package.json');
    if (isFile(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { type?: string };
        return packageJson.type === 'module';
      } catch {
        return false;
      }
    }

    const parent = path.dirname(current);
    if (parent === current || path.basename(current) === 'node_modules') {
      return false;
    }
    current = parent;
  }
}
