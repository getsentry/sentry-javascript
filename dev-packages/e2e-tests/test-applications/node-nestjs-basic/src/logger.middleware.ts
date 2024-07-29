import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

function delay(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Do nothing
  }
}

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log('Logger middleware!');
    delay(500);
    next();
  }
}
