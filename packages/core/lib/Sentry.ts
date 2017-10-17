import { Client } from './Client';

let sharedClient: Client;

export function setSharedClient(client: Client) {
  sharedClient = client;
}

export function getSharedClient() {
  return sharedClient;
}

export class SentryError {
  constructor(...args: any[]) {
    Error.apply(this, args);
    this.name = 'SentryError';
  }
}

SentryError.prototype = new Error();
