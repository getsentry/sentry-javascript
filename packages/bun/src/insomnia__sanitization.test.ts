import { describe, it, expect } from 'bun:test';
import { sanitizeHeaders } from './integrations/http';

describe('Header Sanitization', () => {
  it('should filter sensitive headers', () => {
    const headers = {
      'Set-Cookie': 'session=abc123',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer token',
    };
    const sanitized = sanitizeHeaders(headers);
    expect(sanitized?.['Set-Cookie']).toBe('[Filtered]');
    expect(sanitized?.['Content-Type']).toBe('application/json');
  });

  it('should handle case-insensitive header names', () => {
    const headers = {
      'set-cookie': 'session=abc123',
      'SET-COOKIE': 'session=abc123',
    };
    const sanitized = sanitizeHeaders(headers);
    expect(sanitized?.['set-cookie']).toBe('[Filtered]');
  });
});
