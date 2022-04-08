const fs = require('fs');
const path = require('path');

const testStrings = ['/// <reference types="node" />'];

const paths = [path.join('./build/cjs'), path.join('./build/esm')];

paths.forEach(dir => {
  if (!fs.existsSync(dir)) {
    // eslint-disable-next-line no-console
    console.error(`${dir} doesn't exist please build first`);
    process.exit(1);
  }
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    if (file.includes('.d.ts')) {
      testStrings.forEach(testString => {
        const filePath = path.join(dir, file);
        if (fs.readFileSync(filePath, 'utf8').includes(testString)) {
          // eslint-disable-next-line no-console
          console.error(`${filePath} contains types`);
          process.exit(1);
        }
      });
    }
  });
});
