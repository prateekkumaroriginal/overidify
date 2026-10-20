import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { OptionsApp } from './OptionsApp'
import { Toaster } from '../components/ui/sonner'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <OptionsApp />
    <Toaster closeButton />
  </StrictMode>,
)
