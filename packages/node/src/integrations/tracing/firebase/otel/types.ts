import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  PartialWithFieldValue,
  QuerySnapshot,
  SetOptions,
  WithFieldValue,
} from '@firebase/firestore';
import type { Span } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

/**
 * Firebase Auto Instrumentation
 */
export interface FirebaseInstrumentationConfig extends InstrumentationConfig {
  firestoreSpanCreationHook?: FirestoreSpanCreationHook;
}

export type GetDocsType<AppModelType = DocumentData, DbModelType extends DocumentData = DocumentData> = (
  query: CollectionReference<AppModelType, DbModelType>,
) => Promise<QuerySnapshot<AppModelType, DbModelType>>;

export type SetDocType<AppModelType = DocumentData, DbModelType extends DocumentData = DocumentData> = ((
  reference: DocumentReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
) => Promise<void>) &
  ((
    reference: DocumentReference<AppModelType, DbModelType>,
    data: PartialWithFieldValue<AppModelType>,
    options: SetOptions,
  ) => Promise<void>);

export type AddDocType<AppModelType, DbModelType extends DocumentData> = (
  reference: CollectionReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
) => Promise<DocumentReference<AppModelType, DbModelType>>;

export type DeleteDocType<AppModelType, DbModelType extends DocumentData> = (
  reference: DocumentReference<AppModelType, DbModelType>,
) => Promise<void>;

export interface FirestoreSpanCreationHook {
  (span: Span): void;
}
