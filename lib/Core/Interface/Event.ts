import { Severity } from '../Core';

export class Event {
  message: string;
  severity?: Severity = Severity.Info;
}
