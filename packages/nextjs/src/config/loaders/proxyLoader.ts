import { escapeStringForRegex, logger } from '@sentry/utils';
import * as fs from 'fs';
import * as path from 'path';

import { rollupize } from './rollup';
import { LoaderThis } from './types';

type LoaderOptions = {
  pagesDir: string;
  pageExtensionRegex: string;
  excludedServersideEntrypoints: (RegExp | string)[];
};

/**
 * Replace the loaded file with a proxy module "wrapping" the original file. In the proxy, the original file is loaded,
 * any data-fetching functions (`getInitialProps`, `getStaticProps`, and `getServerSideProps`) it contains are wrapped,
 * and then everything is re-exported.
 */
export default async function proxyLoader(this: LoaderThis<LoaderOptions>, userCode: string): Promise<string> {
  // We know one or the other will be defined, depending on the version of webpack being used
  const { pagesDir, pageExtensionRegex, excludedServersideEntrypoints } =
    'getOptions' in this ? this.getOptions() : this.query;

  // Get the parameterized route name from this page's filepath
  const parameterizedRoute = path
    // Get the path of the file insde of the pages directory
    .relative(pagesDir, this.resourcePath)
    // Add a slash at the beginning
    .replace(/(.*)/, '/$1')
    // Pull off the file extension
    .replace(new RegExp(`\\.(${pageExtensionRegex})`), '')
    // Any page file named `index` corresponds to root of the directory its in, URL-wise, so turn `/xyz/index` into
    // just `/xyz`
    .replace(/\/index$/, '')
    // In case all of the above have left us with an empty string (which will happen if we're dealing with the
    // homepage), sub back in the root route
    .replace(/^$/, '/');

  // For the `excludedServersideEntrypoints` option we need the calculate the relative path to the file in question without file extension.
  const relativePagePath = path
    .join('pages', path.relative(pagesDir, this.resourcePath))
    // Pull off the file extension
    .replace(new RegExp(`\\.(${pageExtensionRegex})`), '');

  const isExcluded = excludedServersideEntrypoints.some(exludeEntry => {
    if (typeof exludeEntry === 'string') {
      return relativePagePath === exludeEntry;
    } else {
      return relativePagePath.match(exludeEntry);
    }
  });

  // We don't want to wrap twice (or infinitely), so in the proxy we add this query string onto references to the
  // wrapped file, so that we know that it's already been processed. (Adding this query string is also necessary to
  // convince webpack that it's a different file than the one it's in the middle of loading now, so that the originals
  // themselves will have a chance to load.)
  if (isExcluded || this.resourceQuery.includes('__sentry_wrapped__')) {
    return userCode;
  }

  const templateFile = parameterizedRoute.startsWith('/api')
    ? 'apiProxyLoaderTemplate.js'
    : 'pageProxyLoaderTemplate.js';
  const templatePath = path.resolve(__dirname, `../templates/${templateFile}`);
  let templateCode = fs.readFileSync(templatePath).toString();
  // Make sure the template is included when runing `webpack watch`
  this.addDependency(templatePath);

  // Inject the route and the path to the file we're wrapping into the template
  templateCode = templateCode.replace(/__ROUTE__/g, parameterizedRoute);
  templateCode = templateCode.replace(/__RESOURCE_PATH__/g, this.resourcePath);

  // Run the proxy module code through Rollup, in order to split the `export * from '<wrapped file>'` out into
  // individual exports (which nextjs seems to require).
  let proxyCode;
  try {
    proxyCode = await rollupize(templateCode, this.resourcePath);
  } catch (err) {
    __DEBUG_BUILD__ &&
      logger.warn(
        `Could not wrap ${this.resourcePath}. An error occurred while processing the proxy module template:\n${err}`,
      );
    return userCode;
  }

  // Add a query string onto all references to the wrapped file, so that webpack will consider it different from the
  // non-query-stringged version (which we're already in the middle of loading as we speak), and load it separately from
  // this. When the second load happens this loader will run again, but we'll be able to see the query string and will
  // know to immediately return without processing. This avoids an infinite loop.
  const resourceFilename = path.basename(this.resourcePath);
  proxyCode = proxyCode.replace(
    new RegExp(`/${escapeStringForRegex(resourceFilename)}'`, 'g'),
    `/${resourceFilename}?__sentry_wrapped__'`,
  );

  return proxyCode;
}
