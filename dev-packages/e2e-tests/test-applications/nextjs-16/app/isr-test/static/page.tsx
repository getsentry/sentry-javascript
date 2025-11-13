export async function generateStaticParams(): Promise<never[]> {
  return [];
}

export default function ISRStaticPage() {
  return (
    <div>
      <h1>ISR Static Page</h1>
      <div id="isr-static-marker">static-isr</div>
    </div>
  );
}
