import { createContext } from 'react-router';

export type User = {
  id: string;
  name: string;
};

export const userContext = createContext<User | null>(null);
