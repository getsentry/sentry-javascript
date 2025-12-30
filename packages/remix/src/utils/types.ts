// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SentryMetaArgs<MetaFN extends (...args: any[]) => any> = Parameters<MetaFN>[0] & {
  data: {
    sentryTrace: string;
    sentryBaggage: string;
  };
};
