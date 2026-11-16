import WebSocket from 'ws';

type AgentReply = { type?: string; id?: string; done?: boolean; success?: boolean; error?: string; result?: unknown };

/** Sends a single frame over a WS to the given agent instance and resolves with the first reply that `isDone` matches. */
function driveAgentSocket(
  baseURL: string,
  binding: string,
  instance: string,
  frame: unknown,
  isDone: (reply: AgentReply) => boolean,
  timeoutLabel: string,
): Promise<AgentReply> {
  const wsUrl = `${baseURL.replace(/^http/, 'ws')}/agents/${binding}/${instance}`;

  return new Promise<AgentReply>((resolveSocket, rejectSocket) => {
    const socket = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      socket.close();
      rejectSocket(new Error(`Timed out waiting for ${timeoutLabel}`));
    }, 15_000);

    socket.on('open', () => {
      socket.send(JSON.stringify(frame));
    });

    socket.on('message', data => {
      try {
        const parsed = JSON.parse(data.toString()) as AgentReply;
        if (isDone(parsed)) {
          clearTimeout(timeout);
          socket.close();
          resolveSocket(parsed);
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

/** Opens a chat WebSocket to `/agents/<binding>/<instance>`, sends one `cf_agent_use_chat_request` frame. */
export async function sendChatMessage(
  baseURL: string,
  options: { binding: string; instance: string; prompt: string },
): Promise<void> {
  const id = `chat-${options.instance}`;
  const frame = {
    type: 'cf_agent_use_chat_request',
    id,
    init: {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: options.prompt }] }],
      }),
    },
  };

  await driveAgentSocket(
    baseURL,
    options.binding,
    options.instance,
    frame,
    reply => reply.type === 'cf_agent_use_chat_response' && reply.id === id && !!reply.done,
    'chat response',
  );
}

/**
 * Opens a WebSocket to `/agents/<binding>/<instance>`, sends one RPC frame, and resolves with the
 * method's result. Rejects with the agent's error message when the RPC fails.
 */
export async function callRpc(
  baseURL: string,
  options: { binding: string; instance: string; method: string; args: unknown[] },
): Promise<unknown> {
  const id = `rpc-${options.method}`;
  const frame = { type: 'rpc', id, method: options.method, args: options.args };

  const reply = await driveAgentSocket(
    baseURL,
    options.binding,
    options.instance,
    frame,
    reply => reply.type === 'rpc' && reply.id === id && (!!reply.done || reply.success === false),
    `RPC reply to "${options.method}"`,
  );

  if (!reply.success) {
    throw new Error(`RPC "${options.method}" failed: ${reply.error}`);
  }

  return reply.result;
}
