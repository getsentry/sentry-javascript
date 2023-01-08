import type webpack from 'webpack';

export type LoaderThis<Options> = {
  /** Path to the file being loaded */
  resourcePath: string;

  /** Query at the end of resolved file name ("../some-folder/some-module?foobar" -> resourceQuery: "?foobar") */
  resourceQuery: string;

  // Function to add outside file used by loader to `watch` process
  addDependency: (filepath: string) => void;

  // Marks a loader as asynchronous
  async: webpack.loader.LoaderContext['async'];

  // Return errors, code, and sourcemaps from an asynchronous loader
  callback: webpack.loader.LoaderContext['callback'];
} & (
  | {
      // Loader options in Webpack 4
      query: Options;
    }
  | {
      // Loader options in Webpack 5
      getOptions: () => Options;
    }
);
