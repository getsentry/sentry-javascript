/** JSDoc */
export interface Mechanism {
  type: string;
  handled: boolean;
  data?: {
    [key: string]: string | boolean;
  };
  synthetic?: boolean;
}
