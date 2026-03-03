/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const { globSync } = require('glob');

function deleteSourcemaps(buildPath) {
  console.info(`[sentry] Deleting sourcemaps from ${buildPath}`);

  // Delete all .map files in the build folder and its subfolders
  const mapFiles = globSync('**/*.map', { cwd: buildPath });

  mapFiles.forEach(file => {
    fs.unlinkSync(path.join(buildPath, file));

    console.info(`[sentry] Deleted ${file}`);
  });
}

module.exports = {
  deleteSourcemaps,
};
