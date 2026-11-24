import { defineHandler } from 'nitro/h3';

export default defineHandler(() => {
  return (globalThis as { __channelRecords?: unknown[] }).__channelRecords ?? [];
});
