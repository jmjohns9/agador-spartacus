import React from 'react';
import { createRoot } from 'react-dom/client';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { buildThemeCSS } from './theme/theme';
import { GLOBAL_CSS } from './theme/globalStyles';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element found');

// Last-resort logging so crashes leave a trail in DevTools even before mount
window.addEventListener('error',           e => console.error('[window.error]',     e.error  ?? e.message));
window.addEventListener('unhandledrejection', e => console.error('[unhandledrejection]', e.reason));

// Theme CSS sits outside the boundary so its crash screen keeps the tokens
const themeCSS = `${buildThemeCSS()}\n${GLOBAL_CSS}`;

createRoot(root).render(
  <>
    <style>{themeCSS}</style>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </>,
);
