import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@theme/ThemeProvider';
import { ToastProvider } from '@context/ToastContext';
import { App } from './App';
import '@i18n/index';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
