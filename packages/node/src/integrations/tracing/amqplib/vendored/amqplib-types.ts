/*
 * Simplified types inlined from @types/amqplib (DefinitelyTyped).
 * Only includes members accessed by this instrumentation.
 * Other amqplib types (Message, ConsumeMessage, Options.Publish, etc.) are already
 * vendored in types.ts by the upstream OTel instrumentation.
 */

export interface Connection {
  connection: { serverProperties: { product?: string; [key: string]: any } };
  [key: string]: any;
}

export interface Channel {
  connection: Connection;
  [key: string]: any;
}

export interface ConfirmChannel extends Channel {}

export namespace Options {
  export interface Connect {
    protocol?: string;
    hostname?: string;
    port?: number;
    username?: string;
    vhost?: string;
  }
  export interface Consume {
    consumerTag?: string;
    noLocal?: boolean;
    noAck?: boolean;
    exclusive?: boolean;
    priority?: number;
    arguments?: any;
  }
  export interface Publish {
    headers?: any;
    [key: string]: any;
  }
}

export namespace Replies {
  export interface Empty {}
  export interface Consume {
    consumerTag: string;
  }
}
