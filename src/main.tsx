import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppV3 from './v3/AppV3.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppV3 />
  </StrictMode>,
)
