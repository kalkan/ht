import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme } from './hooks/useTheme';
import './index.css';

// Apply the persisted theme before first paint to avoid a flash.
try {
  const stored = localStorage.getItem('daily-tracker:theme');
  applyTheme(stored === 'light' || stored === 'dark' ? stored : 'system');
} catch {
  applyTheme('system');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
