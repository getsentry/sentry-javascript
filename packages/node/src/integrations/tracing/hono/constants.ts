export const AttributeNames = {
  HONO_TYPE: 'hono.type',
  HONO_NAME: 'hono.name',
} as const;

export type AttributeNames = (typeof AttributeNames)[keyof typeof AttributeNames];

export const HonoTypes = {
  MIDDLEWARE: 'middleware',
  REQUEST_HANDLER: 'request_handler',
} as const;

export type HonoTypes = (typeof HonoTypes)[keyof typeof HonoTypes];
