import * as fs from 'fs';
import path from 'path';

import { Metrics } from '../collector';

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
    const json = JSON.stringify(this);
    fs.writeFileSync(filePath, json);
  }

  public static readFromFile(filePath: string): Result {
    const json = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const data = JSON.parse(json);
    return new Result(
      data.name || '', data.cpuThrottling || NaN,
      data.networkConditions || '', data.aResults || [], data.bResults || []);
  }
}
