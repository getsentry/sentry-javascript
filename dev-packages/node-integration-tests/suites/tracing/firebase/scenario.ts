import * as Sentry from '@sentry/node';
import './init';

import type { FirebaseOptions } from '@firebase/app';
import { initializeApp } from 'firebase/app';
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  setDoc,
} from 'firebase/firestore/lite'; // seems like "firebase/firestore" is trying to use grpc for connection and it
// does not work with simulator

const options: FirebaseOptions = {
  projectId: 'sentry-15d85',
  apiKey: 'sentry-fake-api-key',
};

const app = initializeApp(options);

const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 5504);
const citiesRef = collection(db, 'cities');

async function addCity(): Promise<void> {
  await addDoc(citiesRef, {
    name: 'San Francisco',
  });
}

async function getCities(): Promise<unknown> {
  const citySnapshot = await getDocs(citiesRef);
  const cityList = citySnapshot.docs.map(doc => doc.data());
  return cityList;
}

async function deleteCity(): Promise<void> {
  await deleteDoc(doc(citiesRef, 'SF'));
}

async function setCity(): Promise<void> {
  await setDoc(doc(citiesRef, 'SF'), {
    name: 'San Francisco',
    state: 'CA',
    country: 'USA',
    capital: false,
    population: 860000,
    regions: ['west_coast', 'norcal'],
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  await Sentry.startSpan({ name: 'root span' }, async () => {
    await addCity();
    await setCity();
    await getCities();
    await deleteCity();
  });
})();
