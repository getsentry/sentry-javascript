import { defineHandler } from 'nitro';

// Fetched internally while the page renders on the server.
export default defineHandler(() => 'internal');
