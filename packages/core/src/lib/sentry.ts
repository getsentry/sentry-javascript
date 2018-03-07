import { Client, Options } from './client';
import { SentryError } from './error';

let sharedClient: Client | undefined;

/** TODO */
export function create(dsn: string, options?: Options): Client {
  return setSharedClient(new Client(dsn, options));
}

/** TODO */
export function setSharedClient(client: Client): Client {
  sharedClient = client;
  return client;
}

/** TODO */
export function getSharedClient(): Client {
  if (!sharedClient) {
    throw new SentryError(
      'SDK not installed. Please call install() before using the SDK',
    );
  }

  return sharedClient;
}
