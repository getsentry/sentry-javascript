export default function TestErrorPage() {
  return <div>This page should never render</div>;
}

export function getServerSideProps() {
  throw new Error('Test error to trigger _error.tsx page');
}
