export type LoaderThis<Options> = {
  /** Path to the file being loaded */
  resourcePath: string;

  /** Query at the end of resolved file name ("../some-folder/some-module?foobar" -> resourceQuery: "?foobar") */
  resourceQuery: string;

  // Function to add outside file used by loader to `watch` process
  addDependency: (filepath: string) => void;
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
