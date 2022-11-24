import * as fs from 'fs';
import * as path from 'path';

import { LoaderThis } from './types';

type LoaderOptions = {
  distDir: string;
};

/**
 * Inject templated code into the beginning of a module.
 */
export default function prefixLoader(this: LoaderThis<LoaderOptions>, userCode: string): string {
  // We know one or the other will be defined, depending on the version of webpack being used
  const { distDir } = 'getOptions' in this ? this.getOptions() : this.query;

  const templatePath = path.resolve(__dirname, '../templates/prefixLoaderTemplate.js');
  // make sure the template is included when runing `webpack watch`
  this.addDependency(templatePath);

  // Fill in the placeholder
  let templateCode = fs.readFileSync(templatePath).toString();
  templateCode = templateCode.replace('__DIST_DIR__', distDir.replace(/\\/g, '\\\\'));

  return `${templateCode}\n${userCode}`;
}
