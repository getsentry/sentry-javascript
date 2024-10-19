export interface WebReadableStream<R = any> {
  locked: boolean; // Indicates if the stream is currently locked

  cancel(reason?: any): Promise<void>; // Cancels the stream with an optional reason
  getReader(): WebReadableStreamDefaultReader<R>; // Returns a reader for the stream
}

export interface WebReadableStreamDefaultReader<R = any> {
  closed: boolean;
  // Closes the stream and resolves the reader's lock
  cancel(reason?: any): Promise<void>;

  // Returns a promise with the next chunk in the stream
  read(): Promise<WebReadableStreamReadResult<R>>;

  // Releases the reader's lock on the stream
  releaseLock(): void;
}

export interface WebReadableStreamReadResult<R = any> {
  done: boolean; // True if the reader is done with the stream
  value?: R; // The data chunk read from the stream (if not done)
}
