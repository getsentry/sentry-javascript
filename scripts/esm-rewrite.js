const { relative } = require('path');
const replace = require('replace-in-file');
const options = {
  files: `${process.cwd()}/esm/**/*.{js,d.ts}`,
  from: /import {([a-zA-Z0-9,\s]*)} from '@sentry\/(browser|core|hub|minimal|types|utils)(\/dist)?(\/(?!esm)[a-zA-Z0-9/]+)?';/gm,
  to: "import {$1} from '@sentry/$2/esm$4';",
};

const changes = replace.sync(options);

if ('VERBOSE' in process.env) {
  if (changes.length > 0) {
    console.log(
      `Imports rewritten to esm in:\n - ${changes.map(path => relative(`${process.cwd()}/esm`, path)).join('\n - ')}`,
    );
  } else {
    console.log('No imports rewritten');
  }
}
