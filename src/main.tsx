import { Buffer } from "buffer";

if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
  (window as any).global = window;
  (window as any).process = (window as any).process || { env: {} };
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
