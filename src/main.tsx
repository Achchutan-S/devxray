import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initTheme } from './utils/theme';
import './index.css';

// Applied before the first React render so the initial paint is already correct.
initTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

// The pre-rendered crawlable shell (scripts/prerender.mjs) is written inside
// #root so that crawlers and no-JS visitors get real content rather than an
// empty document. createRoot clears the container on mount anyway; removing the
// node first makes the handover explicit instead of resting on that behaviour.
document.getElementById('dx-prerender-shell')?.remove();

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
