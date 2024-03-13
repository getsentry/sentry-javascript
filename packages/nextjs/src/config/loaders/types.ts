type LoaderCallback = (
  err: Error | undefined | null,
  content?: string | Buffer,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceMap?: string | any,
) => void;

export type LoaderThis<Options> = {
  /**
   * Path to the file being loaded
   *
   * https://webpack.js.org/api/loaders/#thisresourcepath
   */
  resourcePath: string;

  /**
   * Function to add outside file used by loader to `watch` process
   *
   * https://webpack.js.org/api/loaders/#thisadddependency
   */
  addDependency: (filepath: string) => void;

  /**
   * Marks a loader result as cacheable.
   *
   * https://webpack.js.org/api/loaders/#thiscacheable
   */
  cacheable: (flag: boolean) => void;

  /**
   * Marks a loader as asynchronous
   *
   * https://webpack.js.org/api/loaders/#thisasync
   */
  async: () => undefined | LoaderCallback;

  /**
   * Return errors, code, and sourcemaps from an asynchronous loader
   *
   * https://webpack.js.org/api/loaders/#thiscallback
   */
  callback: LoaderCallback;
} & (
  | {
      /**
       * Loader options in Webpack 4
       *
       * https://webpack.js.org/api/loaders/#thisquery
       */
      query: Options;
    }
  | {
      /**
       * Loader options in Webpack 5
       *
       * https://webpack.js.org/api/loaders/#thisgetoptionsschema
       */
      getOptions: () => Options;
    }
);
