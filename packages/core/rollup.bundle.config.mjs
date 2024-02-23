import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const builds = [];

const targets = process.env.JS_VERSION ? [process.env.JS_VERSION] : ['es5', 'es6'];

if (targets.some(target => target !== 'es5' && target !== 'es6')) {
  throw new Error('JS_VERSION must be either "es5" or "es6"');
}

const addonIntegrationFiles = [
  'captureconsole.ts',
  'debug.ts',
  'dedupe.ts',
  'extraerrordata.ts',
  'rewriteframes.ts',
  'sessiontiming.ts',
];

targets.forEach(jsVersion => {
  addonIntegrationFiles.forEach(integrationFile => {
    const integrationName = integrationFile.split('.')[0];

    const integrationsBundleConfig = makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: [`src/integrations/${integrationFile}`],
      jsVersion,
      licenseTitle: `@sentry/browser - ${integrationName}`,
      outputFileBase: () => `bundles/${integrationName}${jsVersion === 'es5' ? '.es5' : ''}`,
    });

    builds.push(...makeBundleConfigVariants(integrationsBundleConfig));
  });
});

export default builds;
