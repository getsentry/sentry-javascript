import { defineHandler } from 'nitro';

// A plain route for tests to request.
export default defineHandler(() => 'ok');
