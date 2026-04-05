/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * Recursively walks a directory and returns relative paths of all files
 * matching the given extension.
 *
 * Uses manual recursion instead of `fs.readdirSync({ recursive: true, withFileTypes: true })`
 * to avoid a bug in Node 18.17–18.18 where `withFileTypes` returns incorrect `parentPath` values
 * when combined with `recursive: true`.
 *
 * @param {string} rootDir - The root directory to start walking from.
 * @param {string} extension - The file extension to match (e.g. '.map').
 * @returns {string[]} Relative file paths from rootDir.
 */
function walkDirectory(rootDir, extension) {
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(extension)) {
        results.push(path.relative(rootDir, fullPath));
      }
    }
  }

  walk(rootDir);
  return results;
}

function deleteSourcemaps(buildPath) {
  console.info(`[sentry] Deleting sourcemaps from ${buildPath}`);

  // Delete all .map files in the build folder and its subfolders
  const mapFiles = walkDirectory(buildPath, '.map');

  mapFiles.forEach(file => {
    fs.unlinkSync(path.join(buildPath, file));

    console.info(`[sentry] Deleted ${file}`);
  });
}

module.exports = {
  deleteSourcemaps,
};
