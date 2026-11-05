import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Apply the last theme before first paint so a light-theme user never sees a dark flash.
try {
  const cached = JSON.parse(localStorage.getItem('studio:theme') ?? '"dark"');
  document.documentElement.classList.toggle('dark', cached !== 'light');
  document.documentElement.classList.toggle('light', cached === 'light');
} catch {
  // Falls back to the class in index.html.
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
