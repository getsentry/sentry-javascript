const fs = require('fs');
const path = require('path');

function tryReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Bumps the version of all workspace packages and their internal dependencies.
 * This replicates the behavior of:
 *   lerna version --force-publish --exact --no-git-tag-version --no-push --include-merged-tags --yes <newVersion>
 *
 * Specifically:
 * - Updates `version` in every workspace package.json to newVersion
 * - Updates all internal workspace dependency references (dependencies, devDependencies, peerDependencies)
 *   to the new exact version (no ^ or ~ prefix), matching lerna's --exact flag
 * - --force-publish: all packages are updated regardless of whether they changed
 * - No git tags, commits, or pushes are made
 */
function bumpVersions(rootDir, newVersion) {
  const rootPkgPath = path.join(rootDir, 'package.json');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
  const workspaces = rootPkg.workspaces;

  if (!workspaces || !Array.isArray(workspaces)) {
    throw new Error('Could not find workspaces in root package.json');
  }

  // Collect all workspace package names so we know which deps to update
  const workspaceNames = new Set();
  for (const workspace of workspaces) {
    const pkg = tryReadJson(path.join(rootDir, workspace, 'package.json'));
    if (pkg) {
      workspaceNames.add(pkg.name);
    }
  }

  let updatedCount = 0;

  for (const workspace of workspaces) {
    const pkgPath = path.join(rootDir, workspace, 'package.json');
    const pkg = tryReadJson(pkgPath);
    if (!pkg) {
      continue;
    }

    // Update the package version
    pkg.version = newVersion;

    // Update internal workspace dependency versions (exact, no ^)
    // This covers dependencies, devDependencies, and peerDependencies
    for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (!pkg[depType]) {
        continue;
      }

      for (const [dep, ver] of Object.entries(pkg[depType])) {
        // Update all workspace dependencies to the new exact version,
        // matching lerna's --force-publish --exact behavior
        if (workspaceNames.has(dep) && !ver.startsWith('workspace:')) {
          pkg[depType][dep] = newVersion;
        }
      }
    }

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    updatedCount++;
  }

  return updatedCount;
}

// CLI entry point
if (require.main === module) {
  const newVersion = process.argv[2];

  if (!newVersion) {
    console.error('Usage: node scripts/bump-version.js <new-version>');
    process.exit(1);
  }

  const rootDir = path.join(__dirname, '..');
  const updatedCount = bumpVersions(rootDir, newVersion);
  console.log(`Updated ${updatedCount} packages to version ${newVersion}`);
}

module.exports = { bumpVersions };
