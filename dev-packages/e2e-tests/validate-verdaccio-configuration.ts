import * as assert from 'assert';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as YAML from 'yaml';

/*
 * This file is a quick automatic check to confirm that the packages in the Verdaccio configuration always match the
 * packages we defined in our monorepo. This is to ensure that the E2E tests do not use the packages that live on NPM
 * but the local ones instead.
 */

const repositoryRoot = path.resolve(__dirname, '../..');

const verdaccioConfigContent = fs.readFileSync('./verdaccio-config/config.yaml', { encoding: 'utf8' });
const verdaccioConfig = YAML.parse(verdaccioConfigContent);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const sentryScopedPackagesInVerdaccioConfig = Object.keys(verdaccioConfig.packages).filter(packageName =>
  packageName.startsWith('@sentry/'),
);

const packageJsonPaths = glob.sync('packages/*/package.json', {
  cwd: repositoryRoot,
  absolute: true,
});
const packageJsons = packageJsonPaths.map(packageJsonPath => require(packageJsonPath));
const sentryScopedPackageNames = packageJsons
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  .filter(packageJson => packageJson.name.startsWith('@sentry/'))
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  .map(packageJson => packageJson.name);

const extraPackagesInVerdaccioConfig = sentryScopedPackagesInVerdaccioConfig.filter(
  x => !sentryScopedPackageNames.includes(x),
);
const extraPackagesInMonoRepo = sentryScopedPackageNames.filter(
  x => !sentryScopedPackagesInVerdaccioConfig.includes(x),
);

assert.ok(
  extraPackagesInVerdaccioConfig.length === 0 && extraPackagesInMonoRepo.length === 0,
  `Packages in Verdaccio configuration do not match the "@sentry"-scoped packages in monorepo. Make sure they match!\nPackages missing in Verdaccio configuration: ${JSON.stringify(
    extraPackagesInMonoRepo,
  )}\nPackages missing in monorepo: ${JSON.stringify(extraPackagesInVerdaccioConfig)}`,
);
