/**
 * @file main.jsx
 * @description Punto de entrada principal (Entry Point) del frontend React de Appresso.
 *
 * - Vista que representa: Raíz de la Single Page Application (SPA). No dibuja una pantalla
 *   de negocio propia, sino que inicializa el árbol de React y monta `<App />`.
 * - Desde dónde se monta: Se conecta directamente al contenedor DOM `<div id="root"></div>`
 *   definido en `frontend/index.html`, cargado como módulo ES por Vite.
 * - Funciones de `frontend/src/api.js` que consume: Ninguna de forma directa en este archivo;
 *   delega todas las llamadas HTTP a `App.jsx` y a los componentes hijos de `src/components/`.
 * - Rutas HTTP del backend disparadas al iniciar: Al montar `<App />`, se disparan las cargas
 *   iniciales de `GET /orders`, `GET /statistics` y los catálogos de la vista activa (`OperationalERP`).
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Importa la hoja de estilos global (TailwindCSS v4 + estilos base de HeroUI y tipografía)
import './index.css'
// Importa el componente orquestador principal de vistas y navegación de Appresso
import App from './App.jsx'

// Crea la raíz concurrente de React 19 sobre el nodo #root del HTML y renderiza la aplicación.
// <StrictMode> activa verificaciones adicionales en desarrollo (doble invocación controlada de efectos
// para detectar fugas de memoria o side-effects impuros) sin afectar el bundle de producción.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
