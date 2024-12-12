// Vendored from https://github.com/rollup/plugins/blob/0090e728f52828d39b071ab5c7925b9b575cd568/packages/sucrase/src/index.js and modified

/*

The MIT License (MIT)

Copyright (c) 2019 RollupJS Plugin Contributors (https://github.com/rollup/plugins/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/

import fs from 'fs';
import path from 'path';

import { createFilter } from '@rollup/pluginutils';
import { transform } from 'sucrase';

export default function sucrase(opts = {}, sucraseOpts = {}) {
  const filter = createFilter(opts.include, opts.exclude);

  return {
    name: 'sucrase',

    // eslint-disable-next-line consistent-return
    resolveId(importee, importer) {
      if (importer && /^[./]/.test(importee)) {
        const resolved = path.resolve(importer ? path.dirname(importer) : process.cwd(), importee);
        // resolve in the same order that TypeScript resolves modules
        const resolvedFilenames = [
          `${resolved}.ts`,
          `${resolved}.tsx`,
          `${resolved}/index.ts`,
          `${resolved}/index.tsx`,
        ];
        if (resolved.endsWith('.js')) {
          resolvedFilenames.splice(2, 0, `${resolved.slice(0, -3)}.ts`, `${resolved.slice(0, -3)}.tsx`);
        }
        const resolvedFilename = resolvedFilenames.find(filename => fs.existsSync(filename));

        if (resolvedFilename) {
          return resolvedFilename;
        }
      }
    },

    transform(code, id) {
      if (!filter(id)) return null;
      const result = transform(code, {
        transforms: sucraseOpts.transforms,
        filePath: id,
        sourceMapOptions: {
          compiledFilename: id,
        },
        ...sucraseOpts,
      });
      return {
        code: result.code,
        map: result.sourceMap,
      };
    },
  };
}
