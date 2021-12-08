import { Package } from '@sentry/types';
import { existsSync, mkdirSync, promises } from 'fs';
import HtmlWebpackPlugin from 'html-webpack-plugin';
// import { isNotJunk } from 'junk';
import path from 'path';
import webpack from 'webpack';

import webpackConfig from '../webpack.config';

const PACKAGE_PATH = '../../packages';

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
          await promises.readFile(path.resolve(PACKAGE_PATH, d, 'package.json'), { encoding: 'utf-8' }),
        );
        return [packageJSON['name'], path.resolve(PACKAGE_PATH, d)];
      }),
    ),
  );
}

export async function generatePage(
  initialization: string,
  subject: string,
  template: string,
  outPath: string,
): Promise<void> {
  const localPath = `${outPath}/dist`;
  const initializationPath = `${initialization}`;
  const subjectPath = `${subject}`;
  const templatePath = `${template}`;
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
          output: {
            path: localPath,
            filename: '[name].bundle.js',
          },
          plugins: [
            new HtmlWebpackPlugin({
              filename: 'index.html',
              template: templatePath,
              initialization: 'initialization.bundle.js',
              subject: `subject.bundle.js`,
              inject: false,
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
