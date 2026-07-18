import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@dev-jelly/tinytipy/styles.css';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
