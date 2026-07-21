import { useState } from 'react';
import { useAgent } from 'agents/react';

function App() {
  const [greeting, setGreeting] = useState('');
  const [connected, setConnected] = useState(false);

  const agent = useAgent({
    agent: 'my-agent',
    name: 'user-123',
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
  });

  const handleGreet = async () => {
    if (!connected) {
      setGreeting('Not connected yet...');
      return;
    }
    try {
      const result = await agent.call('greet', ['World']);
      setGreeting(result as string);
    } catch (err) {
      setGreeting(`Error: ${err}`);
      console.error('Agent call failed:', err);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
      }}
    >
      <button onClick={handleGreet}>Call Agent</button>
      {greeting && <p>{greeting}</p>}
      <p style={{ fontSize: '0.8rem', color: '#666' }}>{connected ? 'Connected' : 'Connecting...'}</p>
    </div>
  );
}

export default App;
