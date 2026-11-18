import { TRPCReactProvider } from '../../trpc/react';

export default function TrpcLayout({ children }: { children: React.ReactNode }) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
