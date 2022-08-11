/**
 * This loader auto-wraps a user's page-level data-fetching functions (`getStaticProps` and `getServerSideProps`) in
 * order to instrument them for tracing. At a high level, this is done by finding the relevant functions, renaming them
 * so as not to create a name collision, and then creating a new version of each function which is a wrapped version of
 * the original. We do this by parsing the user's code and some template code into ASTs, manipulating them, and then
 * turning them back into strings and appending our template code to the user's (modified) page code. Greater detail and
 * explanations can be found in situ in the functions below and in the helper functions in `ast.ts`.
 *
 * For `getInitialProps` we create a virtual proxy-module that re-exports all the exports and default exports of the
 * original file and wraps `getInitialProps`. We do this since it allows us to very generically wrap `getInitialProps`
 * for all kinds ways users might define default exports (which are a lot of ways).
 */
import { logger } from '@sentry/utils';
import * as fs from 'fs';
import * as path from 'path';

import { isESM } from '../../utils/isESM';
import type { AST } from './ast';
import {
  findDeclarations,
  findExports,
  getExportIdentifierNames,
  hasDefaultExport,
  makeAST,
  removeComments,
  renameIdentifiers,
} from './ast';
import type { LoaderThis } from './types';

// Map to keep track of each function's placeholder in the template and what it should be replaced with. (The latter
// will get added as we process the user code. Setting it to an empty string here means TS won't complain when we set it
// to a non-empty string later.)
const DATA_FETCHING_FUNCTIONS = {
  getServerSideProps: { placeholder: '__ORIG_GSSP__', alias: '' },
  getStaticProps: { placeholder: '__ORIG_GSPROPS__', alias: '' },
};

type LoaderOptions = {
  projectDir: string;
  pagesDir: string;
};

/**
 * Find any data-fetching functions the user's code contains and rename them to prevent clashes, then whittle the
 * template exporting wrapped versions instead down to only the functions found.
 *
 * @param userCode The source code of the current page file
 * @param templateCode The source code of the full template, including all functions
 * @param filepath The path to the current pagefile, within the project directory
 * @returns A tuple of modified user and template code
 */
function wrapFunctions(userCode: string, templateCode: string, filepath: string): string[] {
  let userAST: AST, templateAST: AST;

  try {
    userAST = makeAST(userCode);
    templateAST = makeAST(templateCode);
  } catch (err) {
    logger.warn(`Couldn't add Sentry to ${filepath} because there was a parsing error: ${err}`);
    // Replace the template code with an empty string, so in the end the user code is untouched
    return [userCode, ''];
  }

  // Comments are useful to have in the template for anyone reading it, but don't make sense to be injected into user
  // code, because they're about the template-i-ness of the template, not the code itself
  // TODO: Move this to our rollup build
  removeComments(templateAST);

  for (const functionName of Object.keys(DATA_FETCHING_FUNCTIONS)) {
    // Find and rename all identifiers whose name is `functionName`
    const alias = renameIdentifiers(userAST, functionName);

    // `alias` will be defined iff the user code contains the function in question and renaming has been done
    if (alias) {
      // We keep track of the alias for each function, so that later on we can fill it in for the placeholder in the
      // template. (Not doing that now because it's much more easily done once the template code has gone back to being
      // a string.)
      DATA_FETCHING_FUNCTIONS[functionName as keyof typeof DATA_FETCHING_FUNCTIONS].alias = alias;
    }

    // Otherwise, if the current function doesn't exist anywhere in the user's code, delete the code in the template
    // wrapping that function
    //
    // Note: We start with all of the possible wrapper lines in the template and delete the ones we don't need (rather
    // than starting with none and adding in the ones we do need) because it allows them to live in our souce code as
    // *code*. If we added them in, they'd have to be strings containing code, and we'd lose all of the benefits of
    // syntax highlighting, linting, etc.
    else {
      // We have to look for declarations and exports separately because when we build the SDK, Rollup turns
      //     export const XXX = ...
      // into
      //     const XXX = ...
      //     export { XXX }
      findExports(templateAST, functionName).remove();
      findDeclarations(templateAST, functionName).remove();
    }
  }

  return [userAST.toSource(), templateAST.toSource()];
}

/**
 * Wrap `getInitialProps`, `getStaticProps`, and `getServerSideProps` (if they exist) in the given page code
 */
export default function wrapDataFetchersLoader(this: LoaderThis<LoaderOptions>, userCode: string): string {
  // For now this loader only works for ESM code
  if (!isESM(userCode)) {
    return userCode;
  }

  // We know one or the other will be defined, depending on the version of webpack being used
  const { projectDir, pagesDir } = 'getOptions' in this ? this.getOptions() : this.query;

  // In the following branch we will proxy the user's file. This means we return code (basically an entirely new file)
  // that re - exports all the user file's originial export, but with a "sentry-proxy-loader" query in the module
  // string.
  // This looks like the following: `export { a, b, c } from "[imagine userfile path here]?sentry-proxy-loader";`
  // Additionally, in this proxy file we import the userfile's default export, wrap `getInitialProps` on that default
  // export, and re -export the now modified default export as default.
  // Webpack will resolve the module with the "sentry-proxy-loader" query to the original file, but will give us access
  // to the query via`this.resourceQuery`. If we see that `this.resourceQuery` includes includes "sentry-proxy-loader"
  // we know we're in a proxied file and do not need to proxy again.

  if (!this.resourceQuery.includes('sentry-proxy-loader')) {
    const ast = makeAST(userCode);
    const exportedIdentifiers = getExportIdentifierNames(ast);

    let outputFileContent = '';

    if (exportedIdentifiers.length > 0) {
      outputFileContent += `export { ${exportedIdentifiers.join(', ')} } from "${
        this.resourcePath
      }?sentry-proxy-loader";`;
    }

    if (hasDefaultExport(ast)) {
      outputFileContent += `
        import { default as _sentry_default } from "${this.resourcePath}?sentry-proxy-loader";
        import { withSentryGetInitialProps } from "@sentry/nextjs";

        if (typeof _sentry_default.getInitialProps === 'function') {
          _sentry_default.getInitialProps = withSentryGetInitialProps(_sentry_default.getInitialProps);
        }

        export default _sentry_default;`;
    }

    return outputFileContent;
  } else {
    // If none of the functions we want to wrap appears in the page's code, there's nothing to do. (Note: We do this as a
    // simple substring match (rather than waiting until we've parsed the code) because it's meant to be an
    // as-fast-as-possible fail-fast. It's possible for user code to pass this check, even if it contains none of the
    // functions in question, just by virtue of the correct string having been found, be it in a comment, as part of a
    // longer variable name, etc. That said, when we actually do the code manipulation we'll be working on the code's AST,
    // meaning we'll be able to differentiate between code we actually want to change and any false positives which might
    // come up here.)
    if (Object.keys(DATA_FETCHING_FUNCTIONS).every(functionName => !userCode.includes(functionName))) {
      return userCode;
    }

    const templatePath = path.resolve(__dirname, '../templates/dataFetchersLoaderTemplate.js');
    // make sure the template is included when runing `webpack watch`
    this.addDependency(templatePath);

    const templateCode = fs.readFileSync(templatePath).toString();

    const [modifiedUserCode, modifiedTemplateCode] = wrapFunctions(
      userCode,
      templateCode,
      // Relative path to the page we're currently processing, for use in error messages
      path.relative(projectDir, this.resourcePath),
    );

    // Fill in template placeholders
    let injectedCode = modifiedTemplateCode;
    const route = path
      // Get the path of the file insde of the pages directory
      .relative(pagesDir, this.resourcePath)
      // Add a slash at the beginning
      .replace(/(.*)/, '/$1')
      // Pull off the file extension
      .replace(/\.(jsx?|tsx?)/, '')
      // Any page file named `index` corresponds to root of the directory its in, URL-wise, so turn `/xyz/index` into
      // just `/xyz`
      .replace(/\/index$/, '')
      // In case all of the above have left us with an empty string (which will happen if we're dealing with the
      // homepage), sub back in the root route
      .replace(/^$/, '/');
    injectedCode = injectedCode.replace('__FILEPATH__', route);
    for (const { placeholder, alias } of Object.values(DATA_FETCHING_FUNCTIONS)) {
      injectedCode = injectedCode.replace(new RegExp(placeholder, 'g'), alias);
    }

    return `${modifiedUserCode}\n${injectedCode}`;
  }
}
