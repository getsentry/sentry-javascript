/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function deleteSourcemaps(buildPath) {
  console.info(`[sentry] Deleting sourcemaps from ${buildPath}`);

  const files = fs.readdirSync(buildPath);

  files.forEach(file => {
    if (file.endsWith('.map')) {
      fs.unlinkSync(path.join(buildPath, file));

      console.info(`[sentry] Deleted ${file}`);
    }
  });
}

module.exports = {
  deleteSourcemaps,
};
