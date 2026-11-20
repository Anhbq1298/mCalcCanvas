import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'mathlive/fonts.css';
import 'mathlive/static.css';
import '../composite/composite.css';
import './steel.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
