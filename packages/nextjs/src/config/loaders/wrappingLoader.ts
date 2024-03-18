import * as fs from 'fs';
import * as path from 'path';
import commonjs from '@rollup/plugin-commonjs';
import { stringMatchesSomePattern } from '@sentry/utils';
import * as chalk from 'chalk';
import type { RollupBuild, RollupError } from 'rollup';
import { rollup } from 'rollup';

import type { VercelCronsConfig } from '../../common/types';
import type { LoaderThis } from './types';

// Just a simple placeholder to make referencing module consistent
const SENTRY_WRAPPER_MODULE_NAME = 'sentry-wrapper-module';

// Needs to end in .cjs in order for the `commonjs` plugin to pick it up
const WRAPPING_TARGET_MODULE_NAME = '__SENTRY_WRAPPING_TARGET_FILE__.cjs';

const apiWrapperTemplatePath = path.resolve(__dirname, '..', 'templates', 'apiWrapperTemplate.js');
const apiWrapperTemplateCode = fs.readFileSync(apiWrapperTemplatePath, { encoding: 'utf8' });

const pageWrapperTemplatePath = path.resolve(__dirname, '..', 'templates', 'pageWrapperTemplate.js');
const pageWrapperTemplateCode = fs.readFileSync(pageWrapperTemplatePath, { encoding: 'utf8' });

const middlewareWrapperTemplatePath = path.resolve(__dirname, '..', 'templates', 'middlewareWrapperTemplate.js');
const middlewareWrapperTemplateCode = fs.readFileSync(middlewareWrapperTemplatePath, { encoding: 'utf8' });

let showedMissingAsyncStorageModuleWarning = false;

const serverComponentWrapperTemplatePath = path.resolve(
  __dirname,
  '..',
  'templates',
  'serverComponentWrapperTemplate.js',
);
const serverComponentWrapperTemplateCode = fs.readFileSync(serverComponentWrapperTemplatePath, { encoding: 'utf8' });

const routeHandlerWrapperTemplatePath = path.resolve(__dirname, '..', 'templates', 'routeHandlerWrapperTemplate.js');
const routeHandlerWrapperTemplateCode = fs.readFileSync(routeHandlerWrapperTemplatePath, { encoding: 'utf8' });

export type WrappingLoaderOptions = {
  pagesDir: string | undefined;
  appDir: string | undefined;
  pageExtensionRegex: string;
  excludeServerRoutes: Array<RegExp | string>;
  wrappingTargetKind: 'page' | 'api-route' | 'middleware' | 'server-component' | 'route-handler';
  vercelCronsConfig?: VercelCronsConfig;
  nextjsRequestAsyncStorageModulePath?: string;
};

/**
 * Replace the loaded file with a wrapped version the original file. In the wrapped version, the original file is loaded,
 * any data-fetching functions (`getInitialProps`, `getStaticProps`, and `getServerSideProps`) or API routes it contains
 * are wrapped, and then everything is re-exported.
 */
// eslint-disable-next-line complexity
export default function wrappingLoader(
  this: LoaderThis<WrappingLoaderOptions>,
  userCode: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userModuleSourceMap: any,
): void {
  // We know one or the other will be defined, depending on the version of webpack being used
  const {
    pagesDir,
    appDir,
    pageExtensionRegex,
    excludeServerRoutes = [],
    wrappingTargetKind,
    vercelCronsConfig,
    nextjsRequestAsyncStorageModulePath,
  } = 'getOptions' in this ? this.getOptions() : this.query;

  this.async();

  let templateCode: string;

  if (wrappingTargetKind === 'page' || wrappingTargetKind === 'api-route') {
    if (pagesDir === undefined) {
      this.callback(null, userCode, userModuleSourceMap);
      return;
    }

    // Get the parameterized route name from this page's filepath
    const parameterizedPagesRoute = path
      // Get the path of the file insde of the pages directory
      .relative(pagesDir, this.resourcePath)
      // Replace all backslashes with forward slashes (windows)
      .replace(/\\/g, '/')
      // Add a slash at the beginning
      .replace(/(.*)/, '/$1')
      // Pull off the file extension
      // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- not end user input
      .replace(new RegExp(`\\.(${pageExtensionRegex})`), '')
      // Any page file named `index` corresponds to root of the directory its in, URL-wise, so turn `/xyz/index` into
      // just `/xyz`
      .replace(/\/index$/, '')
      // In case all of the above have left us with an empty string (which will happen if we're dealing with the
      // homepage), sub back in the root route
      .replace(/^$/, '/');

    // Skip explicitly-ignored pages
    if (stringMatchesSomePattern(parameterizedPagesRoute, excludeServerRoutes, true)) {
      this.callback(null, userCode, userModuleSourceMap);
      return;
    }

    if (wrappingTargetKind === 'page') {
      templateCode = pageWrapperTemplateCode;
    } else if (wrappingTargetKind === 'api-route') {
      templateCode = apiWrapperTemplateCode;
    } else {
      throw new Error(`Invariant: Could not get template code of unknown kind "${wrappingTargetKind}"`);
    }

    templateCode = templateCode.replace(/__VERCEL_CRONS_CONFIGURATION__/g, JSON.stringify(vercelCronsConfig));

    // Inject the route and the path to the file we're wrapping into the template
    templateCode = templateCode.replace(/__ROUTE__/g, parameterizedPagesRoute.replace(/\\/g, '\\\\'));
  } else if (wrappingTargetKind === 'server-component' || wrappingTargetKind === 'route-handler') {
    if (appDir === undefined) {
      this.callback(null, userCode, userModuleSourceMap);
      return;
    }

    // Get the parameterized route name from this page's filepath
    const parameterizedPagesRoute = path
      // Get the path of the file insde of the app directory
      .relative(appDir, this.resourcePath)
      // Replace all backslashes with forward slashes (windows)
      .replace(/\\/g, '/')
      // Add a slash at the beginning
      .replace(/(.*)/, '/$1')
      // Pull off the file name
      .replace(/\/[^/]+\.(js|ts|jsx|tsx)$/, '')
      // In case all of the above have left us with an empty string (which will happen if we're dealing with the
      // homepage), sub back in the root route
      .replace(/^$/, '/');

    // Skip explicitly-ignored pages
    if (stringMatchesSomePattern(parameterizedPagesRoute, excludeServerRoutes, true)) {
      this.callback(null, userCode, userModuleSourceMap);
      return;
    }

    // The following string is what Next.js injects in order to mark client components:
    // https://github.com/vercel/next.js/blob/295f9da393f7d5a49b0c2e15a2f46448dbdc3895/packages/next/build/analysis/get-page-static-info.ts#L37
    // https://github.com/vercel/next.js/blob/a1c15d84d906a8adf1667332a3f0732be615afa0/packages/next-swc/crates/core/src/react_server_components.rs#L247
    // We do not want to wrap client components
    if (userCode.includes('__next_internal_client_entry_do_not_use__')) {
      this.callback(null, userCode, userModuleSourceMap);
      return;
    }

    if (wrappingTargetKind === 'server-component') {
      templateCode = serverComponentWrapperTemplateCode;
    } else {
      templateCode = routeHandlerWrapperTemplateCode;
    }

    if (nextjsRequestAsyncStorageModulePath !== undefined) {
      templateCode = templateCode.replace(
        /__SENTRY_NEXTJS_REQUEST_ASYNC_STORAGE_SHIM__/g,
        nextjsRequestAsyncStorageModulePath,
      );
    } else {
      if (!showedMissingAsyncStorageModuleWarning) {
        // eslint-disable-next-line no-console
        console.warn(
          `${chalk.yellow('warn')}  - The Sentry SDK could not access the ${chalk.bold.cyan(
            'RequestAsyncStorage',
          )} module. Certain features may not work. There is nothing you can do to fix this yourself, but future SDK updates may resolve this.\n`,
        );
        showedMissingAsyncStorageModuleWarning = true;
      }
      templateCode = templateCode.replace(
        /__SENTRY_NEXTJS_REQUEST_ASYNC_STORAGE_SHIM__/g,
        '@sentry/nextjs/esm/config/templates/requestAsyncStorageShim.js',
      );
    }

    templateCode = templateCode.replace(/__ROUTE__/g, parameterizedPagesRoute.replace(/\\/g, '\\\\'));

    const componentTypeMatch = path.posix
      .normalize(path.relative(appDir, this.resourcePath))
      .match(/\/?([^/]+)\.(?:js|ts|jsx|tsx)$/);

    if (componentTypeMatch && componentTypeMatch[1]) {
      let componentType;
      switch (componentTypeMatch[1]) {
        case 'page':
          componentType = 'Page';
          break;
        case 'layout':
          componentType = 'Layout';
          break;
        case 'head':
          componentType = 'Head';
          break;
        case 'not-found':
          componentType = 'Not-found';
          break;
        case 'loading':
          componentType = 'Loading';
          break;
        default:
          componentType = 'Unknown';
      }

      templateCode = templateCode.replace(/__COMPONENT_TYPE__/g, componentType);
    } else {
      templateCode = templateCode.replace(/__COMPONENT_TYPE__/g, 'Unknown');
    }
  } else if (wrappingTargetKind === 'middleware') {
    templateCode = middlewareWrapperTemplateCode;
  } else {
    throw new Error(`Invariant: Could not get template code of unknown kind "${wrappingTargetKind}"`);
  }

  // Replace the import path of the wrapping target in the template with a path that the `wrapUserCode` function will understand.
  templateCode = templateCode.replace(/__SENTRY_WRAPPING_TARGET_FILE__/g, WRAPPING_TARGET_MODULE_NAME);

  // Run the proxy module code through Rollup, in order to split the `export * from '<wrapped file>'` out into
  // individual exports (which nextjs seems to require).
  wrapUserCode(templateCode, userCode, userModuleSourceMap)
    .then(({ code: wrappedCode, map: wrappedCodeSourceMap }) => {
      this.callback(null, wrappedCode, wrappedCodeSourceMap);
    })
    .catch(err => {
      // eslint-disable-next-line no-console
      console.warn(
        `[@sentry/nextjs] Could not instrument ${this.resourcePath}. An error occurred while auto-wrapping:\n${err}`,
      );
      this.callback(null, userCode, userModuleSourceMap);
    });
}

/**
 * Use Rollup to process the proxy module code, in order to split its `export * from '<wrapped file>'` call into
 * individual exports (which nextjs seems to need).
 *
 * Wraps provided user code (located under the import defined via WRAPPING_TARGET_MODULE_NAME) with provided wrapper
 * code. Under the hood, this function uses rollup to bundle the modules together. Rollup is convenient for us because
 * it turns `export * from '<wrapped file>'` (which Next.js doesn't allow) into individual named exports.
 *
 * Note: This function may throw in case something goes wrong while bundling.
 *
 * @param wrapperCode The wrapper module code
 * @param userModuleCode The user module code
 * @returns The wrapped user code and a source map that describes the transformations done by this function
 */
async function wrapUserCode(
  wrapperCode: string,
  userModuleCode: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userModuleSourceMap: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ code: string; map?: any }> {
  const wrap = (withDefaultExport: boolean): Promise<RollupBuild> =>
    rollup({
      input: SENTRY_WRAPPER_MODULE_NAME,

      plugins: [
        // We're using a simple custom plugin that virtualizes our wrapper module and the user module, so we don't have to
        // mess around with file paths and so that we can pass the original user module source map to rollup so that
        // rollup gives us a bundle with correct source mapping to the original file
        {
          name: 'virtualize-sentry-wrapper-modules',
          resolveId: id => {
            if (id === SENTRY_WRAPPER_MODULE_NAME || id === WRAPPING_TARGET_MODULE_NAME) {
              return id;
            } else {
              return null;
            }
          },
          load(id) {
            if (id === SENTRY_WRAPPER_MODULE_NAME) {
              return withDefaultExport ? wrapperCode : wrapperCode.replace('export { default } from', 'export {} from');
            } else if (id === WRAPPING_TARGET_MODULE_NAME) {
              return {
                code: userModuleCode,
                map: userModuleSourceMap, // give rollup acces to original user module source map
              };
            } else {
              return null;
            }
          },
        },

        // People may use `module.exports` in their API routes or page files. Next.js allows that and we also need to
        // handle that correctly so we let a plugin to take care of bundling cjs exports for us.
        commonjs({
          sourceMap: true,
          strictRequires: true, // Don't hoist require statements that users may define
          ignoreDynamicRequires: true, // Don't break dynamic requires and things like Webpack's `require.context`
          ignore() {
            // We basically only want to use this plugin for handling the case where users export their handlers with module.exports.
            // This plugin would also be able to convert any `require` into something esm compatible but webpack does that anyways so we just skip that part of the plugin.
            // (Also, modifying require may break user code)
            return true;
          },
        }),
      ],

      // We only want to bundle our wrapper module and the wrappee module into one, so we mark everything else as external.
      external: sourceId => sourceId !== SENTRY_WRAPPER_MODULE_NAME && sourceId !== WRAPPING_TARGET_MODULE_NAME,

      // Prevent rollup from stressing out about TS's use of global `this` when polyfilling await. (TS will polyfill if the
      // user's tsconfig `target` is set to anything before `es2017`. See https://stackoverflow.com/a/72822340 and
      // https://stackoverflow.com/a/60347490.)
      context: 'this',

      // Rollup's path-resolution logic when handling re-exports can go wrong when wrapping pages which aren't at the root
      // level of the `pages` directory. This may be a bug, as it doesn't match the behavior described in the docs, but what
      // seems to happen is this:
      //
      //   - We try to wrap `pages/xyz/userPage.js`, which contains `export { helperFunc } from '../../utils/helper'`
      //   - Rollup converts '../../utils/helper' into an absolute path
      //   - We mark the helper module as external
      //   - Rollup then converts it back to a relative path, but relative to `pages/` rather than `pages/xyz/`. (This is
      //     the part which doesn't match the docs. They say that Rollup will use the common ancestor of all modules in the
      //     bundle as the basis for the relative path calculation, but both our temporary file and the page being wrapped
      //     live in `pages/xyz/`, and they're the only two files in the bundle, so `pages/xyz/`` should be used as the
      //     root. Unclear why it's not.)
      //   - As a result of the miscalculation, our proxy module will include `export { helperFunc } from '../utils/helper'`
      //     rather than the expected `export { helperFunc } from '../../utils/helper'`, thereby causing a build error in
      //     nextjs..
      //
      // Setting `makeAbsoluteExternalsRelative` to `false` prevents all of the above by causing Rollup to ignore imports of
      // externals entirely, with the result that their paths remain untouched (which is what we want).
      makeAbsoluteExternalsRelative: false,
      onwarn: (_warning, _warn) => {
        // Suppress all warnings - we don't want to bother people with this output
        // Might be stuff like "you have unused imports"
        // _warn(_warning); // uncomment to debug
      },
    });

  // Next.js sometimes complains if you define a default export (e.g. in route handlers in dev mode).
  // This is why we want to avoid unnecessarily creating default exports, even if they're just `undefined`.
  // For this reason we try to bundle/wrap the user code once including a re-export of `default`.
  // If the user code didn't have a default export, rollup will throw.
  // We then try bundling/wrapping agian, but without including a re-export of `default`.
  let rollupBuild;
  try {
    rollupBuild = await wrap(true);
  } catch (e) {
    if ((e as RollupError)?.code === 'MISSING_EXPORT') {
      rollupBuild = await wrap(false);
    } else {
      throw e;
    }
  }

  const finalBundle = await rollupBuild.generate({
    format: 'esm',
    sourcemap: 'hidden', // put source map data in the bundle but don't generate a source map commment in the output
  });

  // The module at index 0 is always the entrypoint, which in this case is the proxy module.
  return finalBundle.output[0];
}
