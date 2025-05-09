import { mkdirSync } from 'fs';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';
import webpackConfig from '../webpack.config';
import SentryScenarioGenerationPlugin from './generatePlugin';

export async function generatePage(
  initPath: string,
  subjectPath: string,
  templatePath: string,
  outPath: string,
  outPageName: string = 'index.html',
): Promise<void> {
  mkdirSync(outPath, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const compiler = webpack(
      webpackConfig({
        entry: {
          init: initPath,
          subject: subjectPath,
        },
        output: {
          path: outPath,
          filename: '[name].bundle.js',
        },
        plugins: [
          new SentryScenarioGenerationPlugin(outPath),
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
