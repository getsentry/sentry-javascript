import { defineEventHandler } from '#imports';

// A plain route for tests to request after the tunnel traffic.
export default defineEventHandler(() => 'ok');
