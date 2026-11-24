import { createPool } from 'generic-pool';
import { defineHandler } from 'nitro/h3';

const pool = createPool({ create: async () => ({}), destroy: async () => {} });

export default defineHandler(async () => {
  const resource = await pool.acquire();
  await pool.release(resource);
  return { status: 'ok' };
});
