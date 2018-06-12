/**
 * Lazily serializes data to a JSON file to persist. When created, it loads data
 * from that file if it already exists.
 */
export declare class Store<T> {
    /** Internal path for JSON file. */
    private readonly path;
    /** Value used to initialize data for the first time. */
    private readonly initial;
    /** Current state of the data. */
    private data?;
    /** State whether a flush to disk has been requested in this cycle. */
    private flushing;
    /**
     * Creates a new store.
     *
     * @param path A unique filename to store this data.
     * @param id A unique filename to store this data.
     * @param initial An initial value to initialize data with.
     */
    constructor(path: string, id: string, initial: T);
    /**
     * Updates data by replacing it with the given value.
     * @param next New data to replace the previous one.
     */
    set(next: T): void;
    /**
     * Updates data by passing it through the given function.
     * @param fn A function receiving the current data and returning new one.
     */
    update(fn: (current: T) => T): void;
    /**
     * Returns the current data.
     *
     * When invoked for the first time, it will try to load previously stored data
     * from disk. If the file does not exist, the initial value provided to the
     * constructor is used.
     */
    get(): T;
    /** Returns store to its initial state */
    clear(): void;
    /** Serializes the current data into the JSON file. */
    private flush();
}
