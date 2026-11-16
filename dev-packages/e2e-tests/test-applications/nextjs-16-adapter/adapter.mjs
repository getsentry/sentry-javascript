import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Records the built proxy entrypoint so `server.mjs` can invoke it separately from the render, like Vercel does.
/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'sentry-e2e-adapter',
  async onBuildComplete({ outputs, distDir }) {
    await writeFile(
      join(distDir, 'e2e-adapter-outputs.json'),
      JSON.stringify({ middleware: outputs.middleware?.filePath, distDir }),
    );
  },
};

export default adapter;
