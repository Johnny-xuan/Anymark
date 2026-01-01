/**
 * Onboarding 页面入口
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/globals.css';
import Onboarding from './Onboarding';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Onboarding />
    </React.StrictMode>
  );
}
