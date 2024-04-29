import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const eventsDir = path.join(__dirname, 'events');

export const recreateEventsDir = async () => {
  await fsp.rmdir(eventsDir, { recursive: true });
  await fsp.mkdir(eventsDir);
};

export const readEventsDir = async () => {
  const contents = await fsp.readdir(eventsDir);
  return contents;
};
