import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initTheme } from './utils/theme';
import './index.css';

// Applied before the first React render so the initial paint is already correct.
initTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
