import { describe, expect, it } from 'vitest';
import { extractServerFunctionSha256 } from '../../src/server/utils';

describe('extractServerFunctionSha256', () => {
  it('extracts SHA256 hash from valid server function pathname', () => {
    const pathname = '/_serverFn/1ac31c23f613ec7e58631cf789642e2feb86c58e3128324cf00d746474a044bf';
    const result = extractServerFunctionSha256(pathname);
    expect(result).toBe('1ac31c23f613ec7e58631cf789642e2feb86c58e3128324cf00d746474a044bf');
  });

  it('extracts SHA256 hash from valid server function pathname that is a subpath', () => {
    const pathname = '/api/_serverFn/1ac31c23f613ec7e58631cf789642e2feb86c58e3128324cf00d746474a044bf';
    const result = extractServerFunctionSha256(pathname);
    expect(result).toBe('1ac31c23f613ec7e58631cf789642e2feb86c58e3128324cf00d746474a044bf');
  });

  it('extracts SHA256 hash from valid server function pathname with query parameters', () => {
    const pathname = '/_serverFn/1ac31c23f613ec7e58631cf789642e2feb86c58e3128324cf00d746474a044bf?param=value';
    const result = extractServerFunctionSha256(pathname);
    expect(result).toBe('1ac31c23f613ec7e58631cf789642e2feb86c58e3128324cf00d746474a044bf');
  });

  it('extracts SHA256 hash with uppercase hex characters', () => {
    const pathname = '/_serverFn/1AC31C23F613EC7E58631CF789642E2FEB86C58E3128324CF00D746474A044BF';
    const result = extractServerFunctionSha256(pathname);
    expect(result).toBe('1AC31C23F613EC7E58631CF789642E2FEB86C58E3128324CF00D746474A044BF');
  });

  it('returns unknown for pathname without server function pattern', () => {
    const pathname = '/api/users/123';
    const result = extractServerFunctionSha256(pathname);
    expect(result).toBe('unknown');
  });

  it('returns unknown for pathname with incomplete hash', () => {
    // Hash is too short (only 32 chars instead of 64)
    const pathname = '/_serverFn/1ac31c23f613ec7e58631cf789642e2f';
    const result = extractServerFunctionSha256(pathname);
    expect(result).toBe('unknown');
  });
});
