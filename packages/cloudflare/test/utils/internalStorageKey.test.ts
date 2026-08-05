import { describe, expect, it } from 'vitest';
import {
  getStorageKeys,
  getStorageKeySpanAttributes,
  targetsCloudflareInternalKey,
} from '../../src/utils/internalStorageKey';

describe('targetsCloudflareInternalKey', () => {
  it('matches cf_-prefixed keys', () => {
    expect(targetsCloudflareInternalKey('cf_agents_state')).toBe(true);
    expect(targetsCloudflareInternalKey('cf_mcp_servers')).toBe(true);
  });

  it('matches cf:-prefixed keys (agents chat-recovery namespace)', () => {
    expect(targetsCloudflareInternalKey('cf:chat-recovery:incident:abc')).toBe(true);
    expect(targetsCloudflareInternalKey('cf:chat-recovery:progress')).toBe(true);
    expect(targetsCloudflareInternalKey('cf:chat:recovering')).toBe(true);
  });

  it('matches __ps_-prefixed keys', () => {
    expect(targetsCloudflareInternalKey('__ps_name')).toBe(true);
  });

  it('matches MCP OAuth client-state keys', () => {
    expect(targetsCloudflareInternalKey('/sentry/abc123/def456/token')).toBe(true);
    expect(targetsCloudflareInternalKey('/github-inspector/abc123/state/nonce')).toBe(true);
    expect(targetsCloudflareInternalKey('/sentry/abc123/def456/client_info/')).toBe(true);
  });

  it('does not match user keys', () => {
    expect(targetsCloudflareInternalKey('myKey')).toBe(false);
    expect(targetsCloudflareInternalKey('user_settings')).toBe(false);
  });

  it('does not match keys that merely contain a reserved substring', () => {
    expect(targetsCloudflareInternalKey('my_cf_key')).toBe(false);
  });

  it('returns false for undefined or empty keys', () => {
    expect(targetsCloudflareInternalKey(undefined)).toBe(false);
    expect(targetsCloudflareInternalKey('')).toBe(false);
  });

  it('respects an exact-string allowlist entry', () => {
    expect(targetsCloudflareInternalKey('cf_my_key', ['cf_my_key'])).toBe(false);
    expect(targetsCloudflareInternalKey('cf_other', ['cf_my_key'])).toBe(true);
  });

  it('respects a regex allowlist entry', () => {
    expect(targetsCloudflareInternalKey('cf_reports_daily', [/^cf_reports_/])).toBe(false);
    expect(targetsCloudflareInternalKey('cf_agents_state', [/^cf_reports_/])).toBe(true);
  });
});

describe('getStorageKeys', () => {
  it('extracts a single string key for get/delete', () => {
    expect(getStorageKeys('get', ['myKey'])).toEqual(['myKey']);
    expect(getStorageKeys('delete', ['myKey'])).toEqual(['myKey']);
  });

  it('extracts an array of keys for get/delete', () => {
    expect(getStorageKeys('get', [['a', 'b']])).toEqual(['a', 'b']);
    expect(getStorageKeys('delete', [['a', 'b']])).toEqual(['a', 'b']);
  });

  it('filters non-string entries from key arrays', () => {
    expect(getStorageKeys('get', [['a', 1, 'b']])).toEqual(['a', 'b']);
  });

  it('extracts a single key for put(key, value)', () => {
    expect(getStorageKeys('put', ['myKey', 'myValue'])).toEqual(['myKey']);
  });

  it('extracts all keys for put(entries)', () => {
    expect(getStorageKeys('put', [{ a: 1, b: 2 }])).toEqual(['a', 'b']);
  });

  it('extracts the prefix for list({ prefix })', () => {
    expect(getStorageKeys('list', [{ prefix: 'cf_agents_' }])).toEqual(['cf_agents_']);
  });

  it('returns undefined for list() without a prefix', () => {
    expect(getStorageKeys('list', [])).toBeUndefined();
    expect(getStorageKeys('list', [{}])).toBeUndefined();
  });

  it('returns undefined for alarm methods', () => {
    expect(getStorageKeys('setAlarm', [Date.now()])).toBeUndefined();
    expect(getStorageKeys('deleteAlarm', [])).toBeUndefined();
    expect(getStorageKeys('getAlarm', [])).toBeUndefined();
  });

  it('returns undefined for unknown methods', () => {
    expect(getStorageKeys('deleteAll', [])).toBeUndefined();
  });
});

describe('getStorageKeySpanAttributes', () => {
  it('builds a redis-style statement from the method and keys', () => {
    expect(getStorageKeySpanAttributes('get', ['myKey'])).toEqual({
      'db.query.text': 'get myKey',
    });
  });

  it('joins multiple keys into the statement and sets the batch size', () => {
    expect(getStorageKeySpanAttributes('get', ['key1', 'key2', 'key3'])).toEqual({
      'db.query.text': 'get key1 key2 key3',
      'db.operation.batch.size': 3,
    });
  });

  it('omits the batch size for single-key operations', () => {
    expect(getStorageKeySpanAttributes('put', ['myKey'])).toEqual({
      'db.query.text': 'put myKey',
    });
  });

  it('caps the listed keys and summarizes the rest, keeping the full batch size', () => {
    const keys = Array.from({ length: 128 }, (_, i) => `key${i}`);
    expect(getStorageKeySpanAttributes('get', keys)).toEqual({
      'db.query.text': 'get key0 key1 key2 key3 key4 key5 key6 key7 key8 key9 [118 more keys]',
      'db.operation.batch.size': 128,
    });
  });

  it('returns no attributes for undefined or empty keys', () => {
    expect(getStorageKeySpanAttributes('list', undefined)).toEqual({});
    expect(getStorageKeySpanAttributes('get', [])).toEqual({});
  });
});
