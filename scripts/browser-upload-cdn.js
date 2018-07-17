'use strict';

const Storage = require('@google-cloud/storage');
const path = require('path');
const os = require('os');
const fs = require('fs');

const bundleFilesRegex = /^bundle.*\.js.*$/;
const rootDir = path.dirname(__dirname);
const browserDir = path.join(rootDir, 'packages', 'browser');
const browserBuildDir = path.join(browserDir, 'build');

/** Return full paths of files to upload */
function findFiles() {
  const bundleFiles = fs
    .readdirSync(browserBuildDir)
    .filter(filename => filename.match(bundleFilesRegex))
    .map(filename => path.join(browserBuildDir, filename));
  return bundleFiles;
}

/** Upload sentry-browser bundles to a GCS bucket */
async function uploadFiles() {
  const gcsConfigPath =
    process.env.BROWSER_GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(os.homedir(), '.gcs', 'sentry-browser-sdk.json');
  console.log(`Reading GCS configuration from "${gcsConfigPath}"...`);

  const gcsConfig = fs.existsSync(gcsConfigPath)
    ? JSON.parse(fs.readFileSync(gcsConfigPath))
    : undefined;

  if (!gcsConfig) {
    console.error(
      'Google Storage configuration (service account key) not found.\n' +
        `Place it at ${gcsConfigPath} or use the environment variable ` +
        '(BROWSER_GOOGLE_APPLICATION_CREDENTIALS) to specify the path.',
    );
    process.exit(1);
  }

  const projectId =
    process.env.BROWSER_GOOGLE_PROJECT_ID || gcsConfig.project_id;
  if (!projectId) {
    console.error('Google project ID not found.');
    process.exit(1);
  }

  const bucketName =
    process.env.BROWSER_GOOGLE_BUCKET_NAME || gcsConfig.bucket_name;
  if (!bucketName) {
    console.error('Bucket name not found in the configuration.');
    process.exit(1);
  }

  const bundleFiles = findFiles();
  if (!bundleFiles.length) {
    console.error('Error: no files to upload!');
    process.exit(1);
  }

  const browserPackageJson = path.join(browserDir, 'package.json');
  const version =
    JSON.parse(fs.readFileSync(browserPackageJson)).version || 'unreleased';

  const storage = new Storage({
    projectId,
    credentials: gcsConfig,
  });

  const bucket = storage.bucket(bucketName);
  const cacheAge = 31536000; // 1 year

  await Promise.all(
    bundleFiles.map(async filepath => {
      const destination = path.join(version, path.basename(filepath));
      const options = {
        gzip: true,
        destination: destination,
        metadata: {
          cacheControl: `public, max-age=${cacheAge}`,
        },
      };
      await bucket.upload(filepath, options);
      console.log(`Uploaded "${destination}"`);
    }),
  );
  console.log('Upload complete.');
}

uploadFiles().catch(error => {
  console.error('Error occurred:', error);
  process.exit(1);
});
