import type { LoaderThis } from './types';

/**
 * Test loader for turbopack
 */
export default function (this: LoaderThis<unknown>, source: string, map: any): void {
  this.async();

  // @ts-expect-error this.context is not typed
  // eslint-disable-next-line no-console
  console.log({ t: this, resourcePath: this.resourcePath, context: this.context });

  this.callback(null, source, map);
}
