const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const join = require('path').join;

(async () => {
  const result = (await exec('yarn lerna changed --include-merged-tags -p')).stdout;
  const lines = result.split('\n');

  if (
    !/^yarn/.test(lines[0]) ||
    !/lerna changed/.test(lines[1]) ||
    !/^Done/.test(lines[lines.length - 2]) ||
    lines.length < 4
  ) {
    throw new Error('missing output from lerna changed');
  }
  const changedPackagesFolders = lines.filter(line => {
    return /^\//.test(line);
  });

  console.log('---------------------');
  console.log('Changed Packages:');
  console.log(changedPackagesFolders);
  console.log('---------------------');

  await Promise.all(
    changedPackagesFolders.map(async folder => {
      const archive = (await exec(`cd ${folder}; npm pack`)).stdout.trim();
      return promisify(exec)(`zeus upload ${join(folder, archive)}`);
    }),
  );
})().catch(e => {
  console.error(e);
  process.exit(1);
});
