/**
 * Docs 页面入口
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/globals.css';
import '../i18n/config';
import Docs from './Docs';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Docs />
    </React.StrictMode>
  );
}
