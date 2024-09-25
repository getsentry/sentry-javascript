import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  testException(id: string) {
    throw new Error(`This is an exception with id ${id}`);
  }

  testExpected400Exception(id: string) {
    throw new HttpException(`This is an expected 400 exception with id ${id}`, HttpStatus.BAD_REQUEST);
  }

  testExpected500Exception(id: string) {
    throw new HttpException(`This is an expected 500 exception with id ${id}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
