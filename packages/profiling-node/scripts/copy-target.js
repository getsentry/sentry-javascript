const fs = require('fs');
const path = require('path');
const process = require('process');
const binaries = require('./binaries.js');

const build = path.resolve(__dirname, '..', 'lib');

if (!fs.existsSync(build)) {
  fs.mkdirSync(build);
}

const source = path.join(__dirname, '..', 'build', 'Release', 'sentry_cpu_profiler.node');
const target = path.join(__dirname, '..', 'lib', binaries.getModuleName());

if (!fs.existsSync(source)) {
  // eslint-disable-next-line no-console
  console.log('Source file does not exist:', source);
  process.exit(1);
} else {
  if (fs.existsSync(target)) {
    // eslint-disable-next-line no-console
    console.log('Target file already exists, overwriting it');
  }
  // eslint-disable-next-line no-console
  console.log('Renaming', source, 'to', target);
  fs.renameSync(source, target);
}
