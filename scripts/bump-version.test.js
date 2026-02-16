const fs = require('fs');
const path = require('path');
const os = require('os');
const { bumpVersions } = require('./bump-version');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bump-version-test-'));
}

function writePackageJson(dir, content) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(content, null, 2) + '\n');
}

function readPackageJson(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
}

function setupFixture({ workspaces, packages }) {
  const rootDir = createTempDir();

  // Create workspace directories listed in root package.json
  const workspaceEntries = [];
  for (const [dirName, pkgContent] of Object.entries(packages)) {
    writePackageJson(path.join(rootDir, dirName), pkgContent);
    workspaceEntries.push(dirName);
  }

  // Write root package.json
  writePackageJson(rootDir, {
    private: true,
    name: 'test-monorepo',
    version: '0.0.0',
    workspaces: workspaces || workspaceEntries,
  });

  return rootDir;
}

function cleanup(rootDir) {
  fs.rmSync(rootDir, { recursive: true, force: true });
}

// ---- Tests ----

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

console.log('bump-version.js tests\n');

test('bumps version in all workspace packages', () => {
  const rootDir = setupFixture({
    packages: {
      'packages/core': { name: '@sentry/core', version: '10.0.0' },
      'packages/browser': { name: '@sentry/browser', version: '10.0.0' },
      'packages/node': { name: '@sentry/node', version: '10.0.0' },
    },
  });

  try {
    const count = bumpVersions(rootDir, '10.1.0');
    assertEqual(count, 3, 'should update 3 packages');
    assertEqual(readPackageJson(path.join(rootDir, 'packages/core')).version, '10.1.0', 'core version');
    assertEqual(readPackageJson(path.join(rootDir, 'packages/browser')).version, '10.1.0', 'browser version');
    assertEqual(readPackageJson(path.join(rootDir, 'packages/node')).version, '10.1.0', 'node version');
  } finally {
    cleanup(rootDir);
  }
});

test('updates internal workspace dependencies to exact new version', () => {
  const rootDir = setupFixture({
    packages: {
      'packages/core': { name: '@sentry/core', version: '10.0.0' },
      'packages/browser': {
        name: '@sentry/browser',
        version: '10.0.0',
        dependencies: {
          '@sentry/core': '10.0.0',
        },
      },
    },
  });

  try {
    bumpVersions(rootDir, '10.1.0');
    const browser = readPackageJson(path.join(rootDir, 'packages/browser'));
    assertEqual(browser.dependencies['@sentry/core'], '10.1.0', 'should update @sentry/core dep');
  } finally {
    cleanup(rootDir);
  }
});

test('updates devDependencies and peerDependencies for workspace packages', () => {
  const rootDir = setupFixture({
    packages: {
      'packages/core': { name: '@sentry/core', version: '10.0.0' },
      'packages/utils': { name: '@sentry/utils', version: '10.0.0' },
      'packages/browser': {
        name: '@sentry/browser',
        version: '10.0.0',
        dependencies: { '@sentry/core': '10.0.0' },
        devDependencies: { '@sentry/utils': '10.0.0' },
        peerDependencies: { '@sentry/core': '10.0.0' },
      },
    },
  });

  try {
    bumpVersions(rootDir, '10.1.0');
    const browser = readPackageJson(path.join(rootDir, 'packages/browser'));
    assertEqual(browser.dependencies['@sentry/core'], '10.1.0', 'dependencies');
    assertEqual(browser.devDependencies['@sentry/utils'], '10.1.0', 'devDependencies');
    assertEqual(browser.peerDependencies['@sentry/core'], '10.1.0', 'peerDependencies');
  } finally {
    cleanup(rootDir);
  }
});

test('does not modify external (non-workspace) dependencies', () => {
  const rootDir = setupFixture({
    packages: {
      'packages/core': { name: '@sentry/core', version: '10.0.0' },
      'packages/browser': {
        name: '@sentry/browser',
        version: '10.0.0',
        dependencies: {
          '@sentry/core': '10.0.0',
          'some-external-pkg': '^3.0.0',
          'another-pkg': '~2.1.0',
        },
      },
    },
  });

  try {
    bumpVersions(rootDir, '10.1.0');
    const browser = readPackageJson(path.join(rootDir, 'packages/browser'));
    assertEqual(browser.dependencies['some-external-pkg'], '^3.0.0', 'external dep with caret unchanged');
    assertEqual(browser.dependencies['another-pkg'], '~2.1.0', 'external dep with tilde unchanged');
    assertEqual(browser.dependencies['@sentry/core'], '10.1.0', 'workspace dep updated');
  } finally {
    cleanup(rootDir);
  }
});

test('force-publishes: updates workspace deps even if their version is out of sync (not matching old version)', () => {
  // This is the key difference from the old script: lerna --force-publish updates ALL
  // workspace deps regardless of their current version
  const rootDir = setupFixture({
    packages: {
      'packages/core': { name: '@sentry/core', version: '10.0.0' },
      'packages/browser': {
        name: '@sentry/browser',
        version: '10.0.0',
        dependencies: {
          // Simulates an out-of-sync dependency (e.g., from a failed partial bump)
          '@sentry/core': '9.99.0',
        },
      },
    },
  });

  try {
    bumpVersions(rootDir, '10.1.0');
    const browser = readPackageJson(path.join(rootDir, 'packages/browser'));
    assertEqual(
      browser.dependencies['@sentry/core'],
      '10.1.0',
      'should update out-of-sync workspace dep to new version',
    );
  } finally {
    cleanup(rootDir);
  }
});

test('does not modify root package.json version', () => {
  const rootDir = setupFixture({
    packages: {
      'packages/core': { name: '@sentry/core', version: '10.0.0' },
    },
  });

  try {
    bumpVersions(rootDir, '10.1.0');
    const root = readPackageJson(rootDir);
    assertEqual(root.version, '0.0.0', 'root version should remain 0.0.0');
  } finally {
    cleanup(rootDir);
  }
});

test('preserves package.json fields that are not version-related', () => {
  const rootDir = setupFixture({
    packages: {
      'packages/core': {
        name: '@sentry/core',
        version: '10.0.0',
        description: 'Sentry core',
        main: 'dist/index.js',
        license: 'MIT',
        keywords: ['sentry', 'error-tracking'],
        dependencies: {
          'some-lib': '^1.0.0',
        },
      },
    },
  });

  try {
    bumpVersions(rootDir, '10.1.0');
    const core = readPackageJson(path.join(rootDir, 'packages/core'));
    assertEqual(core.version, '10.1.0', 'version bumped');
    assertEqual(core.description, 'Sentry core', 'description preserved');
    assertEqual(core.main, 'dist/index.js', 'main preserved');
    assertEqual(core.license, 'MIT', 'license preserved');
    assertEqual(core.dependencies['some-lib'], '^1.0.0', 'external dep preserved');
    assert(Array.isArray(core.keywords) && core.keywords.length === 2, 'keywords preserved');
  } finally {
    cleanup(rootDir);
  }
});

test('handles packages with no dependencies at all', () => {
  const rootDir = setupFixture({
    packages: {
      'packages/core': { name: '@sentry/core', version: '10.0.0' },
    },
  });

  try {
    const count = bumpVersions(rootDir, '10.1.0');
    assertEqual(count, 1, 'should update 1 package');
    assertEqual(readPackageJson(path.join(rootDir, 'packages/core')).version, '10.1.0', 'version bumped');
  } finally {
    cleanup(rootDir);
  }
});

test('skips workspace: protocol dependencies', () => {
  const rootDir = setupFixture({
    packages: {
      'packages/core': { name: '@sentry/core', version: '10.0.0' },
      'packages/browser': {
        name: '@sentry/browser',
        version: '10.0.0',
        dependencies: {
          '@sentry/core': 'workspace:*',
        },
      },
    },
  });

  try {
    bumpVersions(rootDir, '10.1.0');
    const browser = readPackageJson(path.join(rootDir, 'packages/browser'));
    assertEqual(browser.dependencies['@sentry/core'], 'workspace:*', 'workspace: protocol dep left unchanged');
  } finally {
    cleanup(rootDir);
  }
});

test('handles dev-packages workspaces alongside regular packages', () => {
  const rootDir = setupFixture({
    packages: {
      'packages/core': { name: '@sentry/core', version: '10.0.0' },
      'dev-packages/test-utils': {
        name: '@sentry-internal/test-utils',
        version: '10.0.0',
        devDependencies: {
          '@sentry/core': '10.0.0',
        },
      },
    },
  });

  try {
    bumpVersions(rootDir, '10.1.0');
    const testUtils = readPackageJson(path.join(rootDir, 'dev-packages/test-utils'));
    assertEqual(testUtils.version, '10.1.0', 'dev-package version bumped');
    assertEqual(testUtils.devDependencies['@sentry/core'], '10.1.0', 'workspace dep in dev-package updated');
  } finally {
    cleanup(rootDir);
  }
});

test('throws when root package.json has no workspaces', () => {
  const rootDir = createTempDir();
  writePackageJson(rootDir, { name: 'bad-root', version: '1.0.0' });

  try {
    let threw = false;
    try {
      bumpVersions(rootDir, '2.0.0');
    } catch (e) {
      threw = true;
      assert(e.message.includes('workspaces'), 'error mentions workspaces');
    }
    assert(threw, 'should throw for missing workspaces');
  } finally {
    cleanup(rootDir);
  }
});

test('throws when a workspace package.json is unreadable', () => {
  const rootDir = createTempDir();
  // List a workspace that doesn't have a package.json
  writePackageJson(rootDir, {
    private: true,
    name: 'test-monorepo',
    version: '0.0.0',
    workspaces: ['packages/core', 'packages/missing'],
  });
  writePackageJson(path.join(rootDir, 'packages/core'), { name: '@sentry/core', version: '10.0.0' });
  // packages/missing has no package.json

  try {
    let threw = false;
    try {
      bumpVersions(rootDir, '10.1.0');
    } catch (e) {
      threw = true;
    }
    assert(threw, 'should throw for unreadable workspace package.json');
    // Verify core was NOT partially updated
    assertEqual(readPackageJson(path.join(rootDir, 'packages/core')).version, '10.0.0', 'no partial update');
  } finally {
    cleanup(rootDir);
  }
});

// ---- Summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
