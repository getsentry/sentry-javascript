import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { mkdirpSync } from './fs';

/**
 * Note, this class is only compatible with Node.
 * Lazily serializes data to a JSON file to persist. When created, it loads data
 * from that file if it already exists.
 */
export class Store<T> {
  /** Internal path for JSON file. */
  private readonly _path: string;
  /** Value used to initialize data for the first time. */
  private readonly _initial: T;
  /** Current state of the data. */
  private _data?: T;
  /** State whether a flush to disk has been requested in this cycle. */
  private _flushing: boolean;

  /**
   * Creates a new store.
   *
   * @param path A unique filename to store this data.
   * @param id A unique filename to store this data.
   * @param initial An initial value to initialize data with.
   */
  public constructor(path: string, id: string, initial: T) {
    this._path = join(path, `${id}.json`);
    this._initial = initial;
    this._flushing = false;
  }

  /**
   * Updates data by replacing it with the given value.
   * @param next New data to replace the previous one.
   */
  public set(next: T): void {
    this._data = next;

    if (!this._flushing) {
      this._flushing = true;
      setImmediate(() => {
        this._flush();
      });
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
    if (this._data === undefined) {
      try {
        this._data = existsSync(this._path) ? (JSON.parse(readFileSync(this._path, 'utf8')) as T) : this._initial;
      } catch (e) {
        this._data = this._initial;
      }
    }

    return this._data;
  }

  /** Returns store to its initial state */
  public clear(): void {
    this.set(this._initial);
  }

  /** Serializes the current data into the JSON file. */
  private _flush(): void {
    try {
      mkdirpSync(dirname(this._path));
      writeFileSync(this._path, JSON.stringify(this._data));
    } catch (e) {
      // This usually fails due to anti virus scanners, issues in the file
      // system, or problems with network drives. We cannot fix or handle this
      // issue and must resume gracefully. Thus, we have to ignore this error.
    } finally {
      this._flushing = false;
    }
  }
}
