import type { Envelope } from './envelope';
import type { Transaction } from './transaction';

// Hooks related to transaction start/finish
export type TransactionHook = {
  name: 'startTransaction' | 'transactionFinish';
  callback: (transaction: Transaction) => void;
};

// Hooks related to envelope create and send
export type EnvelopeHook = {
  name: 'beforeEnvelope';
  callback: (envelope: Envelope) => void;
};

export type Hook = TransactionHook | EnvelopeHook;

export type HookStoreItem<T extends Hook> = Partial<Record<T['name'], T['callback'][]>>;

export type HookStore = HookStoreItem<EnvelopeHook> & HookStoreItem<TransactionHook>;
