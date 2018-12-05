const { relative } = require('path');
const replace = require('replace-in-file');

/**
 * capture group 1
 * `import/export [...] from [...]`
 */
const inExport = '(import|export)';
/**
 * capture group 2
 * Either `import {x, y, z} from [...]`, `import xyz from [...]` or `import * as xyz from [...]`
 */
const thing = '({[a-zA-Z0-9,\\s]*}| *(\\* as )?[a-zA-Z] *)';
/**
 * capture group 4
 * packages with esm modules
 */
const esmPkgs = `(${['browser', 'core', 'hub', 'minimal', 'types', 'utils'].join('|')})`;
/**
 * `from '@sentry/pkg/dist/xyz';` > `from '@sentry/pkg/xyz';`
 */
const removeDist = '(/dist)?';
/**
 * capture group 6
 * `from '@sentry/pkg/xyz';` > `from '@sentry/pkg/esm/xyz';`, if not already imported from esm
 */
const subPath = '(/(?!esm)[a-zA-Z0-9/]+)?';

const options = {
  files: `${process.cwd()}/esm/**/*.{js,d.ts}`,
  from: new RegExp(`${inExport} ${thing} from '@sentry/${esmPkgs}${removeDist}${subPath}';`, 'gm'),
  to: "$1 $2 from '@sentry/$4/esm$6';",
};

const changes = replace.sync(options);

if ('VERBOSE' in process.env) {
  if (changes.length > 0) {
    console.log(
      `Imports rewritten to esm in:\n - ${changes
        .map(function(path) {
          relative(`${process.cwd()}/esm`, path);
        })
        .join('\n - ')}`,
    );
  } else {
    console.log('No imports rewritten');
  }
}
