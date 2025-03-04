// This babel parser config is taken from recast's typescript parser config, specifically from these two files:
// see: https://github.com/benjamn/recast/blob/master/parsers/_babel_options.ts
// see: https://github.com/benjamn/recast/blob/master/parsers/babel-ts.ts
//
// Changes:
// - we don't add the 'jsx' plugin, to correctly parse TypeScript angle bracket type assertions
//   (see https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions)
// - minor import and export changes
// - merged the two files linked above into one for simplicity

// Date of access: 2025-03-04
// Commit: https://github.com/benjamn/recast/commit/ba5132174894b496285da9d001f1f2524ceaed3a

// Recast license:

// Copyright (c) 2012 Ben Newman <bn@cs.stanford.edu>

// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:

// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import type { ParserPlugin } from '@babel/parser';
import { parse as babelParse } from '@babel/parser';
import type { Options } from 'recast';

export const parser: Options['parser'] = {
  parse: (source: string) =>
    babelParse(source, {
      strictMode: false,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      startLine: 1,
      tokens: true,
      plugins: [
        'typescript',
        'asyncGenerators',
        'bigInt',
        'classPrivateMethods',
        'classPrivateProperties',
        'classProperties',
        'classStaticBlock',
        'decimal',
        'decorators-legacy',
        'doExpressions',
        'dynamicImport',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'functionBind',
        'functionSent',
        'importAssertions',
        'exportExtensions' as ParserPlugin,
        'importMeta',
        'nullishCoalescingOperator',
        'numericSeparator',
        'objectRestSpread',
        'optionalCatchBinding',
        'optionalChaining',
        [
          'pipelineOperator',
          {
            proposal: 'minimal',
          },
        ],
        [
          'recordAndTuple',
          {
            syntaxType: 'hash',
          },
        ],
        'throwExpressions',
        'topLevelAwait',
        'v8intrinsic',
      ],
      sourceType: 'module',
    }),
};
