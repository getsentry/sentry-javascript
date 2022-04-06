export interface ReplaySession {
  id: string;
  traceId: string;
  spanId: string;
  started: number;
  lastActivity: number;
}
