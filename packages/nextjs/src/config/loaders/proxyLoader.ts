import { escapeStringForRegex } from '@sentry/utils';
import * as fs from 'fs';
import * as path from 'path';

import { rollupize } from './rollup';
import { LoaderThis } from './types';

type LoaderOptions = {
  pagesDir: string;
  pageExtensionRegex: string;
};

/**
 * Replace the loaded file with a proxy module "wrapping" the original file. In the proxy, the original file is loaded,
 * any data-fetching functions (`getInitialProps`, `getStaticProps`, and `getServerSideProps`) it contains are wrapped,
 * and then everything is re-exported.
 */
export default async function proxyLoader(this: LoaderThis<LoaderOptions>, userCode: string): Promise<string> {
  // We know one or the other will be defined, depending on the version of webpack being used
  const { pagesDir, pageExtensionRegex } = 'getOptions' in this ? this.getOptions() : this.query;

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

  // We don't want to wrap twice (or infinitely), so in the proxy we add this query string onto references to the
  // wrapped file, so that we know that it's already been processed. (Adding this query string is also necessary to
  // convince webpack that it's a different file than the one it's in the middle of loading now, so that the originals
  // themselves will have a chance to load.)
  if (this.resourceQuery.includes('__sentry_wrapped__') || this.resourceQuery.includes('__sentry_external__')) {
    return userCode;
  }

  const templateFile = parameterizedRoute.startsWith('/api')
    ? 'apiProxyLoaderTemplate.js'
    : 'pageProxyLoaderTemplate.js';
  const templatePath = path.resolve(__dirname, `../templates/${templateFile}`);
  let templateCode = fs.readFileSync(templatePath).toString();
  // Make sure the template is included when runing `webpack watch`
  this.addDependency(templatePath);

  // Inject the route into the template
  templateCode = templateCode.replace(/__ROUTE__/g, parameterizedRoute);

  // Fill in the path to the file we're wrapping and save the result as a temporary file in the same folder (so that
  // relative imports and exports are calculated correctly).
  templateCode = templateCode.replace(/__RESOURCE_PATH__/g, this.resourcePath);

  // Run the proxy module code through Rollup, in order to split the `export * from '<wrapped file>'` out into
  // individual exports (which nextjs seems to require), then delete the tempoary file.

  let proxyCode = await rollupize(this.resourcePath, templateCode);

  if (!proxyCode) {
    // We will already have thrown a warning in `rollupize`, so no need to do it again here
    return userCode;
  }

  const resourceFilename = path.basename(this.resourcePath);

  // For some reason when using virtual files (via the @rollup/plugin-virtual), rollup will always resolve imports with
  // absolute imports to relative imports with `..`.In our case we need`.`, which is why we're replacing for that here.
  // Also, we're adding a query string onto all references to the wrapped file, so that webpack will consider it
  // different from the non - query - stringged version(which we're already in the middle of loading as we speak), and
  // load it separately from this. When the second load happens this loader will run again, but we'll be able to see the
  // query string and will know to immediately return without processing. This avoids an infinite loop.
  proxyCode = proxyCode.replace(
    new RegExp(`'../${escapeStringForRegex(resourceFilename)}'`, 'g'),
    `'./${resourceFilename}?__sentry_wrapped__'`,
  );

  return proxyCode;
}
