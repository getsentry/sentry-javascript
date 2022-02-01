import { WebpackConfigObject } from '../src/config/types';

export async function addSrcToEntryPoints(webpackConfig: WebpackConfigObject): Promise<WebpackConfigObject> {
  // make a copy so we don't mutate the original mock
  const entryPropertyObject = {
    ...(typeof webpackConfig.entry === 'function' ? await webpackConfig.entry() : webpackConfig.entry),
  };

  // add `src/` to the beginning of every key (done by replacing each entry with one with the new key)
  for (const [key, value] of Object.entries(entryPropertyObject)) {
    const newKey = `src/${key}`;
    entryPropertyObject[newKey] = value;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete entryPropertyObject[key];
  }

  // make a copy so we don't mutate the original mock
  return { ...webpackConfig, entry: entryPropertyObject };
}
