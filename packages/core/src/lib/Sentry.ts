import {Client} from './client';
import {Options} from './interfaces';

let sharedClient: Client;

export function create(dsn: string, options?: Options) {
  return setSharedClient(new Client(dsn, options));
}

export function setSharedClient(client: Client) {
  sharedClient = client;
  return client;
}

export function getSharedClient() {
  return sharedClient;
}

export class SentryError implements Error {
  public name = 'SentryError';
  constructor(public message: string) {}
}
