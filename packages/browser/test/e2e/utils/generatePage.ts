import { existsSync, mkdirSync } from 'fs';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';

import webpackConfig from '../webpack.config';

export async function generatePage(initialization: string, subject: string, template: string, outPath: string) {
  const localPath = `${outPath}/dist`;
  const initializationPath = `${initialization}`;
  const subjectPath = `${subject}`;
  const templatePath = `${template}`;

  const bundlePath = `${localPath}/index.html`;

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
