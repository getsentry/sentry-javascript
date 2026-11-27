import { defineHandler } from 'void';

export const GET = defineHandler(c => ({ id: c.req.param('id') }));
