import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Effects from './effects/Effects.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Effects />
    <App />
  </StrictMode>,
)