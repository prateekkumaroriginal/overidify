import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { PopupApp } from './PopupApp'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
)
