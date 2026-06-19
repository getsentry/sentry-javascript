import type { Route } from './+types/client-param';

export default function ClientErrorParamPage({ params }: Route.ComponentProps) {
  return (
    <div>
      <h1>Client Error Param Page</h1>
      <button
        id="throw-on-click"
        onClick={() => {
          throw new Error(`¡Madre mía de ${params['client-param']}!`);
        }}
      >
        Throw Error
      </button>
    </div>
  );
}
