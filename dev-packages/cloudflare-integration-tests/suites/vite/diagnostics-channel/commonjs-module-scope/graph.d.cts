export const compiled: {
  invoke(input: { messages: { role: string; content: string }[] }): Promise<unknown>;
};
