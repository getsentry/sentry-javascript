import { Client } from './Client';

let sharedClient: Client;

export function setSharedClient(client: Client) {
  sharedClient = client;
}

export function getSharedClient() {
  return sharedClient;
}
