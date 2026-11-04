import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { registrarPWA } from './pwa';
import { NUBE } from './nube/config';
import { iniciarNube } from './nube/sincronizar';

registrarPWA();
if (NUBE) void iniciarNube();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
