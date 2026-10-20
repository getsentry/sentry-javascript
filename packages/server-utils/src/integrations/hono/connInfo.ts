import type { Context } from './honoTypes';

export type HonoRuntime = 'node' | 'bun' | 'deno' | 'cloudflare';

/** The client side of the request's connection. */
export interface ConnInfo {
  address?: string;
  port?: number;
  transport?: string;
  addressType?: string;
}

// Structural shapes of what each runtime adapter passes to `app.fetch` as `c.env`. They copy the reads of
// Hono's own `getConnInfo` helpers, which moved out of `hono` in Hono 5.
// The readers cast `c.env` to these shapes without validation: the caller selects the runtime, the runtime
// defines the shape, and `readConnInfo` catches a read that throws.
type NodeBindings = {
  incoming?: { socket?: { remoteAddress?: string; remotePort?: number; remoteFamily?: string } };
};
type BunServer = {
  requestIP?: (request: Request) => { address?: string; port?: number; family?: string } | null;
};
type DenoServeHandlerInfo = { remoteAddr?: { hostname?: string; port?: number; transport?: string } };

const READERS: Record<HonoRuntime, (context: Context) => ConnInfo | undefined> = {
  node: context => {
    const env = context.env as (NodeBindings & { server?: NodeBindings }) | undefined;
    const socket = (env?.server ?? env)?.incoming?.socket;
    return socket
      ? { address: socket.remoteAddress, port: socket.remotePort, addressType: socket.remoteFamily }
      : undefined;
  },
  bun: context => {
    const env = context.env as (BunServer & { server?: BunServer }) | undefined;
    const info = (env?.server ?? env)?.requestIP?.(context.req.raw);
    return info ? { address: info.address, port: info.port, addressType: info.family } : undefined;
  },
  deno: context => {
    const remoteAddr = (context.env as DenoServeHandlerInfo | undefined)?.remoteAddr;
    return remoteAddr
      ? { address: remoteAddr.hostname, port: remoteAddr.port, transport: remoteAddr.transport }
      : undefined;
  },
  // On Cloudflare `c.env` holds the user's bindings, so only the request is read.
  cloudflare: context => {
    const address = context.req.raw.headers.get('cf-connecting-ip');
    return address ? { address } : undefined;
  },
};

/**
 * Reads the connection info from the runtime objects that Hono holds for the request.
 * Gives `undefined` when the runtime object is missing or a read throws.
 */
export function readConnInfo(context: Context, runtime: HonoRuntime): ConnInfo | undefined {
  try {
    return READERS[runtime](context);
  } catch {
    return undefined;
  }
}
