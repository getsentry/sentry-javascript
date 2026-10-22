/* eslint-disable no-console */
// Fails an E2E job if one of its apps failed. Each app runs in steps that continue on error, so the job itself would pass.
// An app passes only if its build and test steps both ran and passed, so an app without steps (a `--batch-size` larger
// than the number of app steps in build.yml) fails the job too.
// Reads the `apps` of the job from `APPS`, and the outcomes of the steps of app `i` from `BUILD_<i>` and `TEST_<i>`.
const apps = JSON.parse(process.env.APPS ?? '[]');
const failed = apps.filter((_, i) => process.env[`BUILD_${i}`] !== 'success' || process.env[`TEST_${i}`] !== 'success');

for (const app of failed) {
  console.log(`::error::${app.label} failed or did not run`);
}
process.exitCode = failed.length > 0 ? 1 : 0;
