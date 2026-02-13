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

// Collect all workspace package names so we know which deps to update
const workspaceNames = new Set();
for (const workspace of workspaces) {
  const pkgPath = path.join(__dirname, '..', workspace, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  workspaceNames.add(pkg.name);
}

let updatedCount = 0;

for (const workspace of workspaces) {
  const pkgPath = path.join(__dirname, '..', workspace, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    continue;
  }

  const raw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw);
  const oldVersion = pkg.version;

  // Update the package version
  pkg.version = newVersion;

  // Update internal workspace dependency versions (exact, no ^)
  for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (!pkg[depType]) {
      continue;
    }

    for (const [dep, ver] of Object.entries(pkg[depType])) {
      // Update any internal workspace dependency pinned to the old version
      // This covers dependencies, devDependencies, and peerDependencies
      if (workspaceNames.has(dep) && ver === oldVersion) {
        pkg[depType][dep] = newVersion;
      }
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  updatedCount++;
}

console.log(`Updated ${updatedCount} packages to version ${newVersion}`);
