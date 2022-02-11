import { Package } from '@sentry/types';
import { existsSync, mkdirSync, promises } from 'fs';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import path from 'path';
import webpack from 'webpack';

import webpackConfig from '../webpack.config';

const PACKAGE_PATH = '../../packages';

const bundleKey = process.env.PW_BUNDLE;

// `esm` and `dist` builds are modules that can be imported / aliased by webpack
const useCompiledModule = bundleKey && (bundleKey === 'esm' || bundleKey === 'dist');

// bundles need to be injected into HTML before Sentry initialization.
const useBundle = bundleKey && !useCompiledModule;

const BUNDLE_PATHS: Record<string, Record<string, string>> = {
  browser: {
    dist: 'dist/index.js',
    esm: 'esm/index.js',
    bundle: 'build/bundle.js',
    bundle_min: 'build/bundle.min.js',
    bundle_es6: 'build/bundle.es6.js',
    bundle_es6_min: 'build/bundle.es6.min.js',
  },
  tracing: {
    dist: 'dist/index.js',
    esm: 'esm/index.js',
    bundle: 'build/bundle.tracing.js',
    bundle_min: 'build/bundle.tracing.min.js',
    // `tracing` doesn't have an es6 build
    bundle_es6: 'build/bundle.tracing.js',
    bundle_es6_min: 'build/bundle.tracing.min.js',
  },
};

/**
 * Generate webpack aliases based on packages in monorepo
 * Example of an alias: '@sentry/serverless': 'path/to/sentry-javascript/packages/serverless',
 */
async function generateSentryAlias(): Promise<Record<string, string>> {
  const dirents = (await promises.readdir(PACKAGE_PATH, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dir => dir.name);

  return Object.fromEntries(
    await Promise.all(
      dirents.map(async d => {
        const packageJSON: Package = JSON.parse(
          (await promises.readFile(path.resolve(PACKAGE_PATH, d, 'package.json'), { encoding: 'utf-8' })).toString(),
        );

        const modulePath = path.resolve(PACKAGE_PATH, d);

        if (useCompiledModule && bundleKey && BUNDLE_PATHS[d]?.[bundleKey]) {
          const bundlePath = path.resolve(modulePath, BUNDLE_PATHS[d][bundleKey]);

          return [packageJSON['name'], bundlePath];
        }

        if (useBundle && bundleKey && BUNDLE_PATHS[d]?.[bundleKey]) {
          // If we're injecting a bundle, ignore the webpack import.
          return [packageJSON['name'], false];
        }

        return [packageJSON['name'], modulePath];
      }),
    ),
  );
}

export async function generatePage(
  initializationPath: string,
  subjectPath: string,
  templatePath: string,
  outPath: string,
): Promise<void> {
  const localPath = `${outPath}/dist`;
  const bundlePath = `${localPath}/index.html`;

  const alias = await generateSentryAlias();

  if (!existsSync(localPath)) {
    mkdirSync(localPath, { recursive: true });
  }

  if (!existsSync(bundlePath)) {
    await new Promise<void>((resolve, reject) => {
      const compiler = webpack(
        webpackConfig({
          resolve: {
            alias,
          },
          entry: {
            initialization: initializationPath,
            subject: subjectPath,
          },
          externals: useBundle
            ? {
                '@sentry/browser': 'var Sentry',
                '@sentry/tracing': 'var Sentry',
                Integrations: 'var Sentry.Integrations',
              }
            : {},
          output: {
            path: localPath,
            filename: '[name].bundle.js',
          },
          plugins: [
            new HtmlWebpackPlugin({
              filename: 'index.html',
              template: templatePath,
              sentry_bundles:
                useBundle && bundleKey
                  ? ['browser', 'tracing'].map(sentryPackage =>
                      path.resolve(PACKAGE_PATH, sentryPackage, BUNDLE_PATHS[sentryPackage][bundleKey]),
                    )
                  : [],
              initialization: 'initialization.bundle.js',
              subject: 'subject.bundle.js',
              inject: false,
            }),
          ].filter(Boolean),
        }),
      );

      compiler.run(err => {
        if (err) {
          reject(err);
        }

        compiler.close(err => {
          if (err) {
            reject(err);
          }

          resolve();
        });
      });
    });
  }
}
