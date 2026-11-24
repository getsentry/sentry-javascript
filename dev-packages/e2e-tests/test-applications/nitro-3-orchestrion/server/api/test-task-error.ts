import { defineHandler } from 'nitro/h3';
import { runTask } from 'nitro/task';

export default defineHandler(async () => {
  await runTask('test-error').catch(() => undefined);
  return { status: 'ok' };
});
