import { defineHandler } from 'nitro';
import { useDatabase } from 'nitro/database';
import { useStorage } from 'nitro/storage';

// The page `/data-fetching` fetches this route while it renders on the server.
export default defineHandler(async () => {
  await useStorage('test-storage').setItem('data-fetching:visits', 1);
  await useDatabase().exec('CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY, page TEXT)');

  return { success: true };
});
