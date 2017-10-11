import { Severity } from '../Core';

export class Event {
  id: string = 'TODO';
  message: string;
  severity?: Severity = Severity.Info;
}
