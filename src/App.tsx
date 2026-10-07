import { useEffect } from 'react';
import { useStore } from './store';
import Galaxy from './components/Galaxy';
import HUD from './components/HUD';

function App() {
  const loadFromStorage = useStore((s) => s.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-gray-950">
      <Galaxy />
      <HUD />
    </div>
  );
}

export default App;
