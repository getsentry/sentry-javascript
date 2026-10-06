// `aborted`: whether the transport aborted an envelope fetch since it was last reset.
// `onAbort`: called each time the transport aborts an envelope fetch.
export const lastSend: { aborted: boolean; onAbort?: () => void } = { aborted: false };
