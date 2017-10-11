import { Severity } from './Severity';

export class Event {
  id: string = 'TODO';
  message: string;
  severity?: Severity = Severity.Info;
}
