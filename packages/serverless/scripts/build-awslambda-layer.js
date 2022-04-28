/* eslint-disable no-console */
const path = require('path');
const process = require('process');
const fs = require('fs');
const childProcess = require('child_process');

const findUp = require('find-up');
const packList = require('npm-packlist');
const readPkg = require('read-pkg');

const serverlessPackageJson = require('../package.json');

if (!process.env.GITHUB_ACTIONS) {
  console.log('Skipping build-awslambda-layer script in local environment.');
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

/**
 * Recursively traverses all the dependencies of @param pkg and collects all the info to the map
 * The map ultimately contains @sentry/serverless itself, its direct dependencies and
 * its transitive dependencies.
 *
 * @param cwd       the root directory of the package
 * @param packages  the map accumulating all packages
 */
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
  const serverlessDir = path.resolve(__dirname, '..'); // packages/serverless directory

  const cjsBuildDir = path.resolve(serverlessDir, 'build', 'cjs');
  if (!fs.existsSync(cjsBuildDir)) {
    console.log(`The path ${cjsBuildDir} must exist.`);
    return;
  }

  const packages = await collectPackages(serverlessDir);

  // the build directory of the Lambda layer
  const layerBuildDir = path.resolve(serverlessDir, 'dist-awslambda-layer');

  // the root directory in which the Lambda layer files + dependencies are copied to
  // this structure resembles the structure where Lambda expects to find @sentry/serverless
  const destRootRelative = 'nodejs/node_modules/@sentry/serverless';
  const destRootDir = path.resolve(layerBuildDir, destRootRelative);

  // this is where all the (transitive) dependencies of @sentry/serverless go
  const destRootNodeModulesDir = path.resolve(destRootDir, 'node_modules');

  try {
    // Setting `force: true` ignores exceptions when paths don't exist.
    fs.rmSync(destRootDir, { force: true, recursive: true, maxRetries: 1 });
    fs.mkdirSync(destRootDir, { recursive: true });
  } catch (error) {
    // Ignore errors.
  }

  await Promise.all(
    Object.entries(packages).map(async ([name, pkg]) => {
      const isServelessPkg = name == serverlessPackageJson.name;
      const destDir = isServelessPkg ? destRootDir : path.resolve(destRootNodeModulesDir, name);

      // Scan over the "distributable" files of `pkg` and symlink all of them.
      // `packList` returns all files it deems "distributable" from `pkg.cwd`.
      // "Distributable" means in this case that the file would end up in the NPM tarball of `pkg`.
      // To find out which files are distributable, packlist scans for NPM file configurations in the following order:
      // 1. if `files` section present in package.json, take everything* from there
      // 2. if `.npmignore` present, take everything* except what's ignored there
      // 3. if `.gitignore` present, take everything* except what's ignored there
      // 4. else take everything*
      // In our case, rule 2 applies.
      // * everything except certain unimportant files similarly to what `npm pack` does when packing a tarball.
      // For more information on the rules see: https://github.com/npm/npm-packlist#readme
      const sourceFiles = await packList({ path: pkg.cwd });

      await Promise.all(
        sourceFiles.map(async filename => {
          const sourceFilePath = path.resolve(pkg.cwd, filename);
          const destFilePath = path.resolve(destDir, filename);

          try {
            fs.mkdirSync(path.dirname(destFilePath), { recursive: true });
            fs.symlinkSync(sourceFilePath, destFilePath);
          } catch (error) {
            // Ignore errors.
          }
        }),
      );

      // Now we deal with the `pkg`'s dependencies in its local `node_modules` directory
      const pkgNodeModulesDir = path.resolve(pkg.cwd, 'node_modules');

      // First, check if `pkg` has node modules. If not, we're done with this `pkg`.
      // `fs.constants.F_OK` indicates whether the file is visible to the current process, but it doesn't check
      // its permissions. For more information, refer to https://nodejs.org/api/fs.html#fs_file_access_constants.
      try {
        fs.accessSync(path.resolve(pkgNodeModulesDir), fs.constants.F_OK);
      } catch (error) {
        return;
      }

      // Then, scan over local node_modules folder of `pkg` and symlink its non-dev dependencies.
      const pkgNodeModules = fs.readdirSync(pkgNodeModulesDir);
      await Promise.all(
        pkgNodeModules.map(async nodeModule => {
          if (!pkg.packageJson.dependencies || !pkg.packageJson.dependencies[nodeModule]) {
            return;
          }

          const sourceModulePath = path.resolve(pkgNodeModulesDir, nodeModule);
          const destModulePath = path.resolve(destDir, 'node_modules', nodeModule);

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

  const version = serverlessPackageJson.version;
  const zipFilename = `sentry-node-serverless-${version}.zip`;

  // link from `./build/cjs` to `./dist`
  // This needs to be done to satisfy the NODE_OPTIONS environment variable path that is set in
  // AWS lambda functions when connecting them to Sentry. On initialization, the layer preloads a js
  // file specified in NODE_OPTIONS to initialize the SDK.
  // Hence we symlink everything from `.build/cjs` to `.dist`.
  // This creates duplication but it's not too bad file size wise.
  try {
    fs.symlinkSync(path.resolve(destRootDir, 'build', 'cjs'), path.resolve(destRootDir, 'dist'));
  } catch (error) {
    console.error(error);
  }

  // remove previously created layer zip
  try {
    fs.unlinkSync(path.resolve(layerBuildDir, zipFilename));
  } catch (error) {
    // If the ZIP file hasn't been previously created (e.g. running this script for the first time),
    // `unlinkSync` will try to delete a non-existing file. This error is ignored.
  }

  // create new layer zip
  try {
    childProcess.execSync(`zip -r ${zipFilename} ${destRootRelative}`, { cwd: layerBuildDir });
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
