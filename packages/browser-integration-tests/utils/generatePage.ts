import { existsSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'fs';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import path from 'path';
import webpack from 'webpack';

import webpackConfig from '../webpack.config';
import { TEST_HOST } from './fixtures';
import SentryScenarioGenerationPlugin from './generatePlugin';

const LOADER_TEMPLATE = readFileSync(path.join(__dirname, '../fixtures/loader.js'), 'utf-8');

const LOADER_CONFIGS: Record<string, { bundle: string; options: Record<string, unknown>; lazy: boolean }> = {
  loader_base: {
    bundle: 'browser/build/bundles/bundle.es5.js',
    options: {},
    lazy: true,
  },
  loader_eager: {
    bundle: 'browser/build/bundles/bundle.es5.js',
    options: {},
    lazy: false,
  },
  loader_tracing: {
    bundle: 'browser/build/bundles/bundle.tracing.es5.js',
    options: { tracesSampleRate: 1 },
    lazy: false,
  },
  loader_replay: {
    bundle: 'browser/build/bundles/bundle.replay.min.js',
    options: { replaysSessionSampleRate: 1, replaysOnErrorSampleRate: 1 },
    lazy: false,
  },
  loader_tracing_replay: {
    bundle: 'browser/build/bundles/bundle.tracing.replay.debug.min.js',
    options: { tracesSampleRate: 1, replaysSessionSampleRate: 1, replaysOnErrorSampleRate: 1, debug: true },
    lazy: false,
  },
};

const bundleKey = process.env.PW_BUNDLE || '';

export function generateLoader(outPath: string): void {
  const localPath = `${outPath}/dist`;

  if (!existsSync(localPath)) {
    return;
  }

  // Generate loader files
  const loaderConfig = LOADER_CONFIGS[bundleKey];

  if (!loaderConfig) {
    throw new Error(`Unknown loader bundle key: ${bundleKey}`);
  }

  const localCdnBundlePath = path.join(localPath, 'cdn.bundle.js');

  try {
    unlinkSync(localCdnBundlePath);
  } catch {
    // ignore if this didn't exist
  }

  const cdnSourcePath = path.resolve(__dirname, `../../${loaderConfig.bundle}`);
  symlinkSync(cdnSourcePath, localCdnBundlePath);

  const loaderPath = path.join(localPath, 'loader.js');
  const loaderContent = LOADER_TEMPLATE.replace('__LOADER_BUNDLE__', `'${TEST_HOST}/cdn.bundle.js'`)
    .replace(
      '__LOADER_OPTIONS__',
      JSON.stringify({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        ...loaderConfig.options,
      }),
    )
    .replace('__LOADER_LAZY__', loaderConfig.lazy ? 'true' : 'false');

  writeFileSync(loaderPath, loaderContent, 'utf-8');
}

export async function generatePage(
  initPath: string,
  subjectPath: string,
  templatePath: string,
  outPath: string,
  outPageName: string = 'index.html',
): Promise<void> {
  const localPath = `${outPath}/dist`;
  const bundlePath = `${localPath}/${outPageName}}`;

  if (!existsSync(localPath)) {
    mkdirSync(localPath, { recursive: true });
  }

  if (!existsSync(bundlePath)) {
    await new Promise<void>((resolve, reject) => {
      const compiler = webpack(
        webpackConfig({
          entry: {
            init: initPath,
            subject: subjectPath,
          },
          output: {
            path: localPath,
            filename: '[name].bundle.js',
          },
          plugins: [
            new SentryScenarioGenerationPlugin(),
            new HtmlWebpackPlugin({
              filename: outPageName,
              template: templatePath,
              inject: 'body',
            }),
          ],
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
