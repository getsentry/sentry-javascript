const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Build a cache key for the dependencies of the monorepo.
 * In addition to the content of the yarn.lock file, we also include
 * dependencies of all workspace packages in the cache key.
 * This ensures that we get a consistent cache key even if a dependency change does not affect
 * the yarn.lock file.
 */
function outputDependencyCacheKey() {
  const lockfileContent = fs.readFileSync(path.join(process.cwd(), 'yarn.lock'), 'utf8');

  const hashParts = [lockfileContent];

  const packageJson = require(path.join(process.cwd(), 'package.json'));

  const workspacePackages = packageJson.workspaces || [];

  // Get the package name (e.g. @sentry/browser) of all workspace packages
  // we want to ignore their version numbers later
  const workspacePackageNames = getWorkspacePackageNames(workspacePackages);

  // Add the dependencies of the workspace itself
  hashParts.push(getNormalizedDependencies(packageJson, workspacePackageNames));

  // Now for each workspace package, add the dependencies
  workspacePackages.forEach(workspace => {
    const packageJsonPath = path.join(process.cwd(), workspace, 'package.json');
    const packageJson = require(packageJsonPath);
    hashParts.push(getNormalizedDependencies(packageJson, workspacePackageNames));
  });

  const hash = crypto.createHash('md5').update(hashParts.join('\n')).digest('hex');
  // We log the output in a way that the GitHub Actions can append it to the output
  // We prefix it with `dependencies-` so it is easier to identify in the logs
  // eslint-disable-next-line no-console
  console.log(`hash=dependencies-${hash}`);
}

function getNormalizedDependencies(packageJson, workspacePackageNames) {
  const { dependencies, devDependencies } = packageJson;

  const mergedDependencies = {
    ...devDependencies,
    ...dependencies,
  };

  const normalizedDependencies = {};

  // Sort the keys to ensure a consistent order
  Object.keys(mergedDependencies)
    .sort()
    .forEach(key => {
      // If the dependency is a workspace package, ignore the version
      // No need to invalidate a cache after every release
      const version = workspacePackageNames.includes(key) ? '**workspace**' : mergedDependencies[key];
      normalizedDependencies[key] = version;
    });

  return JSON.stringify(normalizedDependencies);
}

function getWorkspacePackageNames(workspacePackages) {
  return workspacePackages.map(workspace => {
    const packageJsonPath = path.join(process.cwd(), workspace, 'package.json');
    const packageJson = require(packageJsonPath);
    return packageJson.name;
  });
}

outputDependencyCacheKey();
