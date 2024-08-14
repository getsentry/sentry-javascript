import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  constructor() {}

  testException(id: string) {
    throw new Error(`This is an exception with id ${id}`);
  }

  testExpectedException(id: string) {
    throw new HttpException(`This is an expected exception with id ${id}`, HttpStatus.FORBIDDEN);
  }
}
