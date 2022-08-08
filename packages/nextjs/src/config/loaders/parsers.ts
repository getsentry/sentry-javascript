/**
 * Note: The implementation here is loosely based on the jsx and tsx parsers in 'jscodeshift'. It doesn't expose its
 * parsers, so we have to provide our own if we want to use anything besides the default. Fortunately, its parsers turn
 * out to just be wrappers around `babel.parse` with certain options set. The options chosen here are different from the
 * `jscodeshift` parsers in that a) unrecognized and deprecated options and options set to default values have been
 * removed, and b) all standard plugins are included, meaning the widest range of user code is able to be parsed.
 */

import * as babel from '@babel/parser';
import { File } from '@babel/types';

type Parser = {
  parse: (code: string) => babel.ParseResult<File>;
};

const jsxOptions: babel.ParserOptions = {
  // Nextjs supports dynamic import, so this seems like a good idea
  allowImportExportEverywhere: true,
  // We're only supporting wrapping in ESM pages
  sourceType: 'module',
  // Without `tokens`, jsx parsing breaks
  tokens: true,
  // The maximal set of non-mutually-exclusive standard plugins, so as to support as much weird syntax in our users'
  // code as possible
  plugins: [
    'asyncDoExpressions',
    'decimal',
    ['decorators', { decoratorsBeforeExport: false }],
    'decoratorAutoAccessors',
    'destructuringPrivate',
    'doExpressions',
    'estree',
    'exportDefaultFrom',
    'functionBind',
    'importMeta',
    'importAssertions',
    'jsx',
    'moduleBlocks',
    'partialApplication',
    ['pipelineOperator', { proposal: 'hack', topicToken: '^' }],
    'regexpUnicodeSets',
    'throwExpressions',
  ] as babel.ParserPlugin[],
};

const tsxOptions = {
  ...jsxOptions,
  // Because `jsxOptions` is typed as a `ParserOptions` object, TS doesn't discount the possibility of its `plugins`
  // property being undefined, even though it is, in fact, very clearly defined - hence the empty array.
  plugins: [...(jsxOptions.plugins || []), 'typescript'] as babel.ParserPlugin[],
};

/**
 * Create either a jsx or tsx parser to be used by `jscodeshift`.
 *
 * @param type Either 'jsx' or 'tsx'
 * @returns An object with the appropriate `parse` method.
 */
export function makeParser(type: 'jsx' | 'tsx'): Parser {
  const options = type === 'jsx' ? jsxOptions : tsxOptions;
  return {
    parse: code => babel.parse(code, options),
  };
}
