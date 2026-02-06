export const AUTH_OPERATIONS_TO_INSTRUMENT = [
  'reauthenticate',
  'signInAnonymously',
  'signInWithOAuth',
  'signInWithIdToken',
  'signInWithOtp',
  'signInWithPassword',
  'signInWithSSO',
  'signOut',
  'signUp',
  'verifyOtp',
] as const;

export const AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT = [
  'createUser',
  'deleteUser',
  'listUsers',
  'getUserById',
  'updateUserById',
  'inviteUserByEmail',
] as const;

export const FILTER_MAPPINGS = {
  eq: 'eq',
  neq: 'neq',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  like: 'like',
  'like(all)': 'likeAllOf',
  'like(any)': 'likeAnyOf',
  ilike: 'ilike',
  'ilike(all)': 'ilikeAllOf',
  'ilike(any)': 'ilikeAnyOf',
  is: 'is',
  in: 'in',
  cs: 'contains',
  cd: 'containedBy',
  sr: 'rangeGt',
  nxl: 'rangeGte',
  sl: 'rangeLt',
  nxr: 'rangeLte',
  adj: 'rangeAdjacent',
  ov: 'overlaps',
  fts: '',
  plfts: 'plain',
  phfts: 'phrase',
  wfts: 'websearch',
  not: 'not',
};

export const DB_OPERATIONS_TO_INSTRUMENT = ['select', 'insert', 'upsert', 'update', 'delete'] as const;

export const QUEUE_RPC_OPERATIONS = new Set(['send', 'send_batch', 'pop', 'receive', 'read']);

export const INTEGRATION_NAME = 'Supabase';

/**
 * Maximum size for message body size calculation to prevent performance issues.
 * Messages larger than this will not have their size calculated.
 */
export const MAX_MESSAGE_SIZE_FOR_CALCULATION = 1024 * 100; // 100KB
