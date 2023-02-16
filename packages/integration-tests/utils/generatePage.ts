import { existsSync, mkdirSync } from 'fs';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';

import webpackConfig from '../webpack.config';
import SentryScenarioGenerationPlugin from './generatePlugin';

export async function generatePage(
  initializationPath: string,
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
            initialization: initializationPath,
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
