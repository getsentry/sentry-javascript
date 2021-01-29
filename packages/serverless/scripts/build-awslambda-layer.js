/* eslint-disable no-console */
const path = require('path');
const process = require('process');
const fs = require('fs');
const childProcess = require('child_process');

const findUp = require('find-up');
const packList = require('npm-packlist');
const readPkg = require('read-pkg');

const serverlessPackage = require('../package.json');

if (!process.env.GITHUB_ACTIONS) {
  console.log(`Skipping build-awslambda-layer script in local environment.`);
  process.exit(0);
}

// AWS Lambda layer are being uploaded as zip archive, whose content is then being unpacked to the /opt
// directory in the lambda environment.
//
// So this script does the following: it builds a 'dist-awslambda-layer/nodejs/node_modules/@sentry/serverless'
// directory with a special index.js and with all necessary @sentry packages symlinked as node_modules.
// Then, this directory is compressed with zip.
//
// The tricky part about it is that one cannot just symlink the entire package directories into node_modules because
// all the src/ contents and other unnecessary files will end up in the zip archive. So, we need to symlink only
// individual files from package and it must be only those of them that are distributable.
// There exists a `npm-packlist` library for such purpose. So we need to traverse all the dependencies,
// execute `npm-packlist` on them and symlink the files into 'dist-awslambda-layer/.../@sentry/serverless/node_modules'.
// I didn't find any way to achieve this goal using standard command-line tools so I have to write this script.
//
// Another, and much simpler way to assemble such zip bundle is install all the dependencies from npm registry and
// just bundle the entire node_modules.
// It's easier and looks more stable but it's inconvenient if one wants build a zip bundle out of current source tree.
//
// And yet another way is to bundle everything with webpack into a single file. I tried and it seems to be error-prone
// so I think it's better to have a classic package directory with node_modules file structure.

/** Recursively traverse all the dependencies and collect all the info to the map */
async function collectPackages(cwd, packages = {}) {
  const packageJson = await readPkg({ cwd });

  packages[packageJson.name] = { cwd, packageJson };

  if (!packageJson.dependencies) {
    return packages;
  }

  await Promise.all(
    Object.keys(packageJson.dependencies).map(async dep => {
      // We are interested only in 'external' dependencies which are strictly upper than current directory.
      // Internal deps aka local node_modules folder of each package is handled differently.
      const searchPath = path.resolve(cwd, '..');
      const depPath = fs.realpathSync(
        await findUp(path.join('node_modules', dep), { type: 'directory', cwd: searchPath }),
      );
      if (packages[dep]) {
        if (packages[dep].cwd != depPath) {
          throw new Error(`${packageJson.name}'s dependency ${dep} maps to both ${packages[dep].cwd} and ${depPath}`);
        }
        return;
      }
      await collectPackages(depPath, packages);
    }),
  );

  return packages;
}

async function main() {
  const workDir = path.resolve(__dirname, '..'); // packages/serverless directory
  const distRequirements = path.resolve(workDir, 'dist');
  if (!fs.existsSync(distRequirements)) {
    console.log(`The path ${distRequirements} must exist.`);
    return;
  }
  const packages = await collectPackages(workDir);

  const dist = path.resolve(workDir, 'dist-awslambda-layer');
  const destRootRelative = 'nodejs/node_modules/@sentry/serverless';
  const destRoot = path.resolve(dist, destRootRelative);
  const destModulesRoot = path.resolve(destRoot, 'node_modules');

  try {
    // Setting `force: true` ignores exceptions when paths don't exist.
    fs.rmSync(destRoot, { force: true, recursive: true, maxRetries: 1 });
    fs.mkdirSync(destRoot, { recursive: true });
  } catch (error) {
    // Ignore errors.
  }

  await Promise.all(
    Object.entries(packages).map(async ([name, pkg]) => {
      const isRoot = name == serverlessPackage.name;
      const destPath = isRoot ? destRoot : path.resolve(destModulesRoot, name);

      // Scan over the distributable files of the module and symlink each of them.
      const sourceFiles = await packList({ path: pkg.cwd });
      await Promise.all(
        sourceFiles.map(async filename => {
          const sourceFilename = path.resolve(pkg.cwd, filename);
          const destFilename = path.resolve(destPath, filename);

          try {
            fs.mkdirSync(path.dirname(destFilename), { recursive: true });
            fs.symlinkSync(sourceFilename, destFilename);
          } catch (error) {
            // Ignore errors.
          }
        }),
      );

      const sourceModulesRoot = path.resolve(pkg.cwd, 'node_modules');
      // `fs.constants.F_OK` indicates whether the file is visible to the current process, but it doesn't check
      // its permissions. For more information, refer to https://nodejs.org/api/fs.html#fs_file_access_constants.
      try {
        fs.accessSync(path.resolve(sourceModulesRoot), fs.constants.F_OK);
      } catch (error) {
        return;
      }

      // Scan over local node_modules folder of the package and symlink its non-dev dependencies.
      const sourceModules = fs.readdirSync(sourceModulesRoot);
      await Promise.all(
        sourceModules.map(async sourceModule => {
          if (!pkg.packageJson.dependencies || !pkg.packageJson.dependencies[sourceModule]) {
            return;
          }

          const sourceModulePath = path.resolve(sourceModulesRoot, sourceModule);
          const destModulePath = path.resolve(destPath, 'node_modules', sourceModule);

          try {
            fs.mkdirSync(path.dirname(destModulePath), { recursive: true });
            fs.symlinkSync(sourceModulePath, destModulePath);
          } catch (error) {
            // Ignore errors.
          }
        }),
      );
    }),
  );

  const version = serverlessPackage.version;
  const zipFilename = `sentry-node-serverless-${version}.zip`;

  try {
    fs.unlinkSync(path.resolve(dist, zipFilename));
  } catch (error) {
    // If the ZIP file hasn't been previously created (e.g. running this script for the first time),
    // `unlinkSync` will try to delete a non-existing file. This error is ignored.
  }

  try {
    childProcess.execSync(`zip -r ${zipFilename} ${destRootRelative}`, { cwd: dist });
  } catch (error) {
    // The child process timed out or had non-zero exit code.
    // The error contains the entire result from `childProcess.spawnSync`.
    console.log(error);
  }
}

main().then(
  () => {
    process.exit(0);
  },
  err => {
    console.error(err);
    process.exit(-1);
  },
);
