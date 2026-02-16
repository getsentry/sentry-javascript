const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];

if (!newVersion) {
  console.error('Usage: node scripts/bump-version.js <new-version>');
  process.exit(1);
}

const rootPkgPath = path.join(__dirname, '..', 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
const workspaces = rootPkg.workspaces;

if (!workspaces || !Array.isArray(workspaces)) {
  console.error('Could not find workspaces in root package.json');
  process.exit(1);
}

function tryReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// Collect all workspace package names so we know which deps to update
const workspaceNames = new Set();
for (const workspace of workspaces) {
  const pkg = tryReadJson(path.join(__dirname, '..', workspace, 'package.json'));
  if (pkg) {
    workspaceNames.add(pkg.name);
  }
}

let updatedCount = 0;

for (const workspace of workspaces) {
  const pkgPath = path.join(__dirname, '..', workspace, 'package.json');
  const pkg = tryReadJson(pkgPath);
  if (!pkg) {
    continue;
  }

  const oldVersion = pkg.version;

  // Update the package version
  pkg.version = newVersion;

  // Update internal workspace dependency versions (exact, no ^)
  // This covers dependencies, devDependencies, and peerDependencies
  for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (!pkg[depType]) {
      continue;
    }

    for (const [dep, ver] of Object.entries(pkg[depType])) {
      if (workspaceNames.has(dep) && ver === oldVersion) {
        pkg[depType][dep] = newVersion;
      }
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  updatedCount++;
}

console.log(`Updated ${updatedCount} packages to version ${newVersion}`);
