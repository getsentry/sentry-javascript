import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { isExpectedError } from '../src/helpers';

describe('isExpectedError', () => {
  it('should return true for HttpException', () => {
    expect(isExpectedError(new HttpException('Bad Request', HttpStatus.BAD_REQUEST))).toBe(true);
  });

  it('should return true for RpcException-like objects', () => {
    const rpcLike = {
      getError: () => 'some error',
      initMessage: () => {},
    };
    expect(isExpectedError(rpcLike)).toBe(true);
  });

  it('should return true for WsException-like objects without initMessage', () => {
    const wsLike = {
      getError: () => 'some error',
      constructor: { name: 'WsException' },
    };
    expect(isExpectedError(wsLike)).toBe(true);
  });

  it('should return false for plain Error', () => {
    expect(isExpectedError(new Error('test'))).toBe(false);
  });

  it('should return false for object with status property', () => {
    expect(isExpectedError({ status: 502, message: 'Bad Gateway' })).toBe(false);
  });
});
