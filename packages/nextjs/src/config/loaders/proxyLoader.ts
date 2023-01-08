import { stringMatchesSomePattern } from '@sentry/utils';
import * as fs from 'fs';
import * as path from 'path';

import { rollupize } from './rollup';
import { LoaderThis } from './types';

type LoaderOptions = {
  pagesDir: string;
  pageExtensionRegex: string;
  excludeServerRoutes: Array<RegExp | string>;
};

/**
 * Replace the loaded file with a proxy module "wrapping" the original file. In the proxy, the original file is loaded,
 * any data-fetching functions (`getInitialProps`, `getStaticProps`, and `getServerSideProps`) it contains are wrapped,
 * and then everything is re-exported.
 */
export default async function proxyLoader(this: LoaderThis<LoaderOptions>, userCode: string): Promise<string> {
  // We know one or the other will be defined, depending on the version of webpack being used
  const {
    pagesDir,
    pageExtensionRegex,
    excludeServerRoutes = [],
  } = 'getOptions' in this ? this.getOptions() : this.query;

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

  // Skip explicitly-ignored pages
  if (stringMatchesSomePattern(parameterizedRoute, excludeServerRoutes, true)) {
    return userCode;
  }

  const templateFile = parameterizedRoute.startsWith('/api') ? 'apiWrapperTemplate.js' : 'pageWrapperTemplate.js';
  const templatePath = path.resolve(__dirname, `../templates/${templateFile}`);
  let templateCode = fs.readFileSync(templatePath, { encoding: 'utf8' });

  // Make sure the template is included when running `webpack watch`
  this.addDependency(templatePath);

  // Inject the route and the path to the file we're wrapping into the template
  templateCode = templateCode.replace(/__ROUTE__/g, parameterizedRoute.replace(/\\/g, '\\\\'));

  // Run the proxy module code through Rollup, in order to split the `export * from '<wrapped file>'` out into
  // individual exports (which nextjs seems to require).
  try {
    return await rollupize(templateCode, userCode);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[@sentry/nextjs] Could not instrument ${this.resourcePath}. An error occurred while auto-wrapping:\n${err}`,
    );
    return userCode;
  }
}
