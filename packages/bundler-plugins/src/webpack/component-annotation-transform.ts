// Webpack loader for component annotation transform
// Based on unplugin v1.0.1 transform loader pattern

export default async function transform(
  this: {
    async: () => (err: Error | null, content?: string, sourceMap?: unknown) => void;
    resourcePath: string;
    query: {
      transform?: (
        code: string,
        id: string
      ) => Promise<{ code: string; map?: unknown } | null | undefined | string>;
    };
  },
  source: string,
  map: unknown
): Promise<void> {
  const callback = this.async();
  const { transform: transformFn } = this.query;

  if (!transformFn) {
    return callback(null, source, map);
  }

  try {
    const id = this.resourcePath;
    const result = await transformFn(source, id);

    if (result == null) {
      callback(null, source, map);
    } else if (typeof result === "string") {
      callback(null, result, map);
    } else {
      callback(null, result.code, result.map || map);
    }
  } catch (error) {
    if (error instanceof Error) {
      callback(error);
    } else {
      callback(new Error(String(error)));
    }
  }
}
