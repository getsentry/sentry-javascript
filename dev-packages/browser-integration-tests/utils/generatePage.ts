import { mkdirSync } from 'fs';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';
import webpackConfig from '../webpack.config';
import SentryScenarioGenerationPlugin, { useLoader } from './generatePlugin';

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
            // Deferred scripts may run after the loader has swapped in the CDN bundle but before it calls
            // `init()`, so their SDK calls would be dropped. Blocking scripts always hit the loader stub.
            scriptLoading: useLoader ? 'blocking' : 'defer',
          }),
        ],
      }),
    );

    compiler.run(err => {
      if (err) {
        reject(err);
        return;
      }

      compiler.close(err => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  });
}
