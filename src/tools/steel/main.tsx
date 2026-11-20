import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../composite/composite.css';
import './steel.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
