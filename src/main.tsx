import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'mathlive/fonts.css';
import 'mathlive/static.css';
import './math/mathliveSetup';
import './styles/global.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
