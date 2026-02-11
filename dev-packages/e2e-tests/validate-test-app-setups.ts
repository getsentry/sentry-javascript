/* eslint-disable no-console */
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';

const testRecipePaths = glob.sync('test-applications/*/test-recipe.json', {
  cwd: __dirname,
  absolute: true,
});

testRecipePaths.forEach(testRecipePath => {
  const testAppPath = path.dirname(testRecipePath);
  const npmrcPath = path.resolve(testAppPath, '.npmrc');

  if (!fs.existsSync(npmrcPath)) {
    console.log(
      `No .npmrc found in test application "${testAppPath}". Please add a .npmrc to this test application that uses the fake test registry. (More info in dev-packages/e2e-tests/README.md)`,
    );
    process.exit(1);
  }

  const npmrcContents = fs.readFileSync(npmrcPath, 'utf-8');
  if (!npmrcContents.includes('http://localhost:4873')) {
    console.log(
      `.npmrc in test application "${testAppPath} doesn't contain a reference to the fake test registry at "http://localhost:4873". Please add a .npmrc to this test application that uses the fake test registry. (More info in dev-packages/e2e-tests/README.md)`,
    );
    process.exit(1);
  }
});
