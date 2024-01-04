import * as fs from 'fs';
import path from 'path';

import { Metrics } from '../collector.js';
import type { JsonObject } from '../util/json.js';
import { JsonStringify } from '../util/json.js';

export class Result {
  public constructor(
    public readonly name: string,
    public readonly cpuThrottling: number,
    public readonly networkConditions: string,
    public readonly scenarioResults: Metrics[][],
  ) {}

  /**
   *
   */
  public static readFromFile(filePath: string): Result {
    const json = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const data = JSON.parse(json) as JsonObject<unknown>;
    return new Result(
      data.name as string,
      data.cpuThrottling as number,
      data.networkConditions as string,
      ((data.scenarioResults as Partial<Metrics>[][]) || []).map(list => list.map(Metrics.fromJSON.bind(Metrics))),
    );
  }

  /**
   *
   */
  public writeToFile(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    const json = JsonStringify(this);
    fs.writeFileSync(filePath, json);
  }
}
