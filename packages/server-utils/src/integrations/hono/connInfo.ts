import type { Context } from './honoTypes';

export type HonoRuntime = 'node' | 'bun' | 'deno' | 'cloudflare';

/** The client side of the request's connection. */
export interface ConnInfo {
  address?: string;
  port?: number;
  transport?: string;
  addressType?: string;
}

// What the runtime adapters pass to `app.fetch` as `c.env`. The readers copy Hono's `getConnInfo` helpers,
// which Hono 5 moved out of `hono`. The casts are unchecked, and `readConnInfo` catches a read that throws.
type NodeBindings = {
  incoming?: { socket?: { remoteAddress?: string; remotePort?: number; remoteFamily?: string } };
};
type BunServer = {
  requestIP?: (request: Request) => { address?: string; port?: number; family?: string } | null;
};
type DenoServeHandlerInfo = { remoteAddr?: { hostname?: string; port?: number; transport?: string } };

const READERS: Record<HonoRuntime, (context: Context) => ConnInfo | undefined> = {
  // https://github.com/honojs/node-server/blob/v2.1.5/src/conninfo.ts
  node: context => {
    const env = context.env as (NodeBindings & { server?: NodeBindings }) | undefined;
    const socket = (env?.server ?? env)?.incoming?.socket;
    return socket
      ? { address: socket.remoteAddress, port: socket.remotePort, addressType: socket.remoteFamily }
      : undefined;
  },
  // https://github.com/honojs/hono/blob/v4.13.13/src/adapter/bun/conninfo.ts
  bun: context => {
    const env = context.env as (BunServer & { server?: BunServer }) | undefined;
    const info = (env?.server ?? env)?.requestIP?.(context.req.raw);
    return info ? { address: info.address, port: info.port, addressType: info.family } : undefined;
  },
  // https://github.com/honojs/hono/blob/v4.13.13/src/adapter/deno/conninfo.ts
  deno: context => {
    const remoteAddr = (context.env as DenoServeHandlerInfo | undefined)?.remoteAddr;
    return remoteAddr
      ? { address: remoteAddr.hostname, port: remoteAddr.port, transport: remoteAddr.transport }
      : undefined;
  },
  // `c.env` holds the user's bindings here, so only the header is read.
  // https://github.com/honojs/hono/blob/v4.13.13/src/adapter/cloudflare-workers/conninfo.ts
  cloudflare: context => {
    const address = context.req.raw.headers.get('cf-connecting-ip');
    return address ? { address } : undefined;
  },
};

/** Gives `undefined` when the runtime object is missing or a read throws. */
export function readConnInfo(context: Context, runtime: HonoRuntime): ConnInfo | undefined {
  try {
    return READERS[runtime](context);
  } catch {
    return undefined;
  }
}
