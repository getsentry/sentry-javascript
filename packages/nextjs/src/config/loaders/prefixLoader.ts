import { escapeStringForRegex } from '@sentry/utils';
import * as fs from 'fs';
import * as path from 'path';

import type { LoaderThis } from './types';

type LoaderOptions = {
  templatePrefix: string;
  replacements: Array<[string, string]>;
};

/**
 * Inject templated code into the beginning of a module.
 *
 * Options:
 *   - `templatePrefix`: The XXX in `XXXPrefixLoaderTemplate.ts`, to specify which template to use
 *   - `replacements`: An array of tuples of the form `[<placeholder>, <replacementValue>]`, used for doing global
 *        string replacement in the template. Note: The replacement is done sequentially, in the order in which the
 *        replacement values are given. If any placeholder is a substring of any replacement value besides its own, make
 *        sure to order the tuples in such a way as to avoid over-replacement.
 */
export default function prefixLoader(this: LoaderThis<LoaderOptions>, userCode: string): string {
  // We know one or the other will be defined, depending on the version of webpack being used
  const { templatePrefix, replacements } = 'getOptions' in this ? this.getOptions() : this.query;

  const templatePath = path.resolve(__dirname, `../templates/${templatePrefix}PrefixLoaderTemplate.js`);
  // make sure the template is included when runing `webpack watch`
  this.addDependency(templatePath);

  // Fill in placeholders
  let templateCode = fs.readFileSync(templatePath).toString();
  replacements.forEach(([placeholder, value]) => {
    const placeholderRegex = new RegExp(escapeStringForRegex(placeholder), 'g');
    templateCode = templateCode.replace(placeholderRegex, value);
  });

  return `${templateCode}\n${userCode}`;
}
