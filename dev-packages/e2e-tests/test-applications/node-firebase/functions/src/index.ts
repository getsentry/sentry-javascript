import './init';

import { onDocumentCreated, onDocumentCreatedWithAuthContext } from 'firebase-functions/firestore';
import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { setGlobalOptions } from 'firebase-functions/options';
import * as admin from 'firebase-admin';

setGlobalOptions({ region: 'default' });

admin.initializeApp();

const db = admin.firestore();

export const helloWorld = onRequest(async (request, response) => {
  logger.info('Hello logs!', { structuredData: true });

  response.send('Hello from Firebase!');
});

export const unhandeledError = onRequest(async (request, response) => {
  throw new Error('There is an error!');
});

export const onCallSomething = onRequest(async (request, response) => {
  const data = {
    name: request.body?.name || 'Sample Document',
    timestamp: performance.now(),
    description: request.body?.description || 'Created via Cloud Function',
  };

  await db.collection('documents').add(data);

  logger.info('Create document!', { structuredData: true });

  response.send({ message: 'Document created!' });
});

export const onDocumentCreate = onDocumentCreated('documents/{documentId}', async event => {
  const documentId = event.params.documentId;

  await db.collection('documents').doc(documentId).update({
    processed: true,
    processedAt: new Date(),
  });
});

export const onDocumentCreateWithAuthContext = onDocumentCreatedWithAuthContext('documents/{documentId}', async () => {
  // noop
});
