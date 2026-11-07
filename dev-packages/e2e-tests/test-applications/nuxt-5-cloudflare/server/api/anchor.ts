import { defineHandler } from 'nitro';

// A plain route for tests to request after the tunnel traffic.
export default defineHandler(() => 'ok');
