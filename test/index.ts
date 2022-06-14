export * from './mocks/mockRrweb'; // XXX: Needs to happen before `mockSdk` or importing SentryReplay!
export * from './mocks/mockSdk';

export const BASE_TIMESTAMP = new Date('2020-02-02 00:00:00').getTime(); // 1580619600000
