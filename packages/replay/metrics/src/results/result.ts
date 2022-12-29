import * as fs from 'fs';
import path from 'path';

import { Metrics } from '../collector.js';

export class Result {
  constructor(
    public readonly name: string, public readonly cpuThrottling: number,
    public readonly networkConditions: string,
    public readonly aResults: Metrics[],
    public readonly bResults: Metrics[]) { }

  public writeToFile(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    const json = this.serialize();
    fs.writeFileSync(filePath, json);
  }

  serialize(): string {
    return JSON.stringify(this, (_: any, value: any): any => {
      if (typeof value != 'undefined' && typeof value.toJSON == 'function') {
        return value.toJSON();
      } else {
        return value;
      }
    }, 2);
  }

  public static readFromFile(filePath: string): Result {
    const json = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const data = JSON.parse(json);
    return new Result(
      data.name || '',
      data.cpuThrottling as number,
      data.networkConditions || '',
      (data.aResults || []).map(Metrics.fromJSON),
      (data.bResults || []).map(Metrics.fromJSON),
    );
  }
}
