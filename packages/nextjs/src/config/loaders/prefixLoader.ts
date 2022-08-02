import * as fs from 'fs';
import * as path from 'path';

type LoaderOptions = {
  distDir: string;
};
// TODO Use real webpack types
type LoaderThis = {
  // Webpack 4
  query?: LoaderOptions;
  // Webpack 5
  getOptions?: () => LoaderOptions;
  addDependency: (filepath: string) => void;
};

/**
 * Inject templated code into the beginning of a module.
 */
function prefixLoader(this: LoaderThis, userCode: string): string {
  // We know one or the other will be defined, depending on the version of webpack being used
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { distDir } = this.getOptions ? this.getOptions() : this.query!;

  const templatePath = path.resolve(__dirname, '../templates/prefixLoaderTemplate.js');
  // make sure the template is included when runing `webpack watch`
  this.addDependency(templatePath);

  // Fill in the placeholder
  let templateCode = fs.readFileSync(templatePath).toString();
  templateCode = templateCode.replace('__DIST_DIR__', distDir);

  return `${templateCode}\n${userCode}`;
}

export { prefixLoader as default };
