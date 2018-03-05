import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';

const _0777 = parseInt('0777', 8);

function mkdirpSync(path: string): void {
  // tslint:disable-next-line:no-bitwise
  const mode = _0777 & ~process.umask();
  const resPath = resolve(path);

  try {
    mkdirSync(resPath, mode);
  } catch (err) {
    if (err.code === 'ENOENT') {
      mkdirpSync(dirname(resPath));
      mkdirSync(resPath);
    } else {
      try {
        if (!statSync(resPath).isDirectory()) {
          throw err;
        }
      } catch (_) {
        throw err;
      }
    }
  }
}

/**
 * Lazily serializes data to a JSON file to persist.
 * When created, it loads data from that file if it already exists.
 */
export default class Store<T> {
  /** Current state of the data. */
  private data: T;
  /** Internal path for JSON file. */
  private path: string;
  /** State whether a flush to disk has been requested in this cycle. */
  private flushing: boolean = false;

  /**
   * Creates a new store.
   *
   * @param path A unique filename to store this data.
   * @param id A unique filename to store this data.
   * @param initial An initial value to initialize data with.
   */
  constructor(path: string, id: string, private initial?: T) {
    this.path = join(path, `${id}.json`);
  }

  /**
   * Updates data by replacing it with the given value.
   * @param next New data to replace the previous one.
   */
  public set(next: T): void {
    this.data = next;

    if (!this.flushing) {
      this.flushing = true;
      setImmediate(() => this.flush());
    }
  }

  /**
   * Updates data by passing it through the given function.
   * @param fn A function receiving the current data and returning new one.
   */
  public update(fn: (current: T) => T): void {
    this.set(fn(this.get()));
  }

  /**
   * Returns the current data.
   *
   * When invoked for the first time, it will try to load previously stored data
   * from disk. If the file does not exist, the initial value provided to the
   * constructor is used.
   */
  public get(): T {
    if (this.data === undefined) {
      this.data = existsSync(this.path)
        ? JSON.parse(readFileSync(this.path, 'utf8'))
        : this.initial;
    }
    return this.data;
  }

  /**
   * Returns store to its initial state
   */
  public clear(): void {
    this.set(this.initial as T);
  }

  /** Serializes the current data into the JSON file. */
  private flush(): void {
    mkdirpSync(dirname(this.path));
    writeFileSync(this.path, JSON.stringify(this.data));
    this.flushing = false;
  }
}
