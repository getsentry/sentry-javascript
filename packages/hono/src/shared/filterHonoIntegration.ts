import type { Integration } from '@sentry/core';

export const filterHonoIntegration = (integration: Integration): boolean => integration.name !== 'Hono';
