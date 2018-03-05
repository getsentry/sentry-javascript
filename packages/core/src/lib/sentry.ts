import Client, { Options } from './client';

let sharedClient: Client;

export function create(dsn: string, options?: Options): Client {
  return setSharedClient(new Client(dsn, options));
}

export function setSharedClient(client: Client): Client {
  sharedClient = client;
  return client;
}

export function getSharedClient(): Client {
  return sharedClient;
}
