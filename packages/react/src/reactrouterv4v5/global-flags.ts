import type { Client } from '@sentry/types';

export const V4_SETUP_CLIENTS = new WeakMap<Client, boolean>();

export const V5_SETUP_CLIENTS = new WeakMap<Client, boolean>();
