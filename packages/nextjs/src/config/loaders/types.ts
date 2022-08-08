// TODO Use real webpack types
export type LoaderThis<Options> = {
  // Path to the file being loaded
  resourcePath: string;

  // Loader options in Webpack 4
  query?: Options;
  // Loader options in Webpack 5
  getOptions?: () => Options;

  // Function to add outside file used by loader to `watch` process
  addDependency: (filepath: string) => void;
};
