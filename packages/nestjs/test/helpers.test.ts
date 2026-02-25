import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { isExpectedError } from '../src/helpers';

describe('isExpectedError', () => {
  it('should return true for HttpException', () => {
    expect(isExpectedError(new HttpException('Bad Request', HttpStatus.BAD_REQUEST))).toBe(true);
  });

  it('should return true for HttpException with 500 status', () => {
    expect(isExpectedError(new HttpException('Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR))).toBe(true);
  });

  it('should return true for RpcException-like objects', () => {
    const rpcLike = {
      getError: () => 'some error',
      initMessage: () => {},
    };
    expect(isExpectedError(rpcLike)).toBe(true);
  });

  it('should return false for plain Error', () => {
    expect(isExpectedError(new Error('test'))).toBe(false);
  });

  it('should return false for object with status property', () => {
    expect(isExpectedError({ status: 502, message: 'Bad Gateway' })).toBe(false);
  });

  it('should return false for object with error property', () => {
    expect(isExpectedError({ error: 'something went wrong' })).toBe(false);
  });

  it('should return false for object with only getError method', () => {
    expect(isExpectedError({ getError: () => 'error' })).toBe(false);
  });

  it('should return false for object with only getStatus method', () => {
    expect(isExpectedError({ getStatus: () => 500 })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isExpectedError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isExpectedError(undefined)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isExpectedError('error')).toBe(false);
  });
});
