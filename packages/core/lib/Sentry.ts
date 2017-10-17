import {Client} from './Client';

let sharedClient: Client;

export function setSharedClient(client: Client) {
  sharedClient = client;
}

export function getSharedClient() {
  return sharedClient;
}

export class SentryError implements Error {
  public name = 'SentryError';
  constructor(public message: string) {}
}
