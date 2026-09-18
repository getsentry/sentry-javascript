import WebSocket from 'ws';

type AgentReply = { type?: string; id?: string; done?: boolean; result?: unknown };

/**
 * Opens a WebSocket to `/agents/<binding>/<instance>`, sends one RPC frame, and
 * resolves with the reply's `result` — the method's return value — once it arrives.
 */
export function callRpc(
  baseURL: string,
  options: { binding: string; instance: string; method: string; args: unknown[] },
): Promise<unknown> {
  const id = `rpc-${options.method}`;
  const frame = { type: 'rpc', id, method: options.method, args: options.args };
  const wsUrl = `${baseURL.replace(/^http/, 'ws')}/agents/${options.binding}/${options.instance}`;

  return new Promise<unknown>((resolveSocket, rejectSocket) => {
    const socket = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      socket.close();
      rejectSocket(new Error(`Timed out waiting for RPC reply to "${options.method}"`));
    }, 15_000);

    socket.on('open', () => {
      socket.send(JSON.stringify(frame));
    });

    socket.on('message', data => {
      try {
        const parsed = JSON.parse(data.toString()) as AgentReply;
        if (parsed.type === 'rpc' && parsed.id === id && parsed.done) {
          clearTimeout(timeout);
          socket.close();
          resolveSocket(parsed.result);
        }
      } catch {
        // Ignore non-JSON / unrelated frames.
      }
    });

    socket.on('error', err => {
      clearTimeout(timeout);
      rejectSocket(err);
    });
  });
}
