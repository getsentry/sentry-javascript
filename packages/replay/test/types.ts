import { Transport } from '@sentry/types';

export type MockTransportSend = jest.MockedFunction<Transport['send']>;
export type DomHandler = (args: any) => any;
