/** JSDoc
 * @deprecated Use string literals - if you require type casting, cast to TransactionSamplingMethod type
 */
export enum TransactionSamplingMethod {
  Explicit = 'explicitly_set',
  Sampler = 'client_sampler',
  Rate = 'client_rate',
  Inheritance = 'inheritance',
}
