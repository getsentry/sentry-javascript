/**
 * Recursively creates the given path.
 *
 * @param path A relative or absolute path to create.
 * @returns A Promise that resolves when the path has been created.
 */
export declare function mkdirp(path: string): Promise<void>;
/**
 * Synchronous version of {@link mkdirp}.
 *
 * @param path A relative or absolute path to create.
 */
export declare function mkdirpSync(path: string): void;
