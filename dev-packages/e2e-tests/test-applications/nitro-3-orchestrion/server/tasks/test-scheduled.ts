import { defineTask } from 'nitro/task';

export default defineTask({
  meta: { name: 'test-scheduled' },
  run: () => {
    return { result: 'ok' };
  },
});
