import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { VariablesProvider } from '../components/VariablesProvider'
import { OptionsApp } from './OptionsApp'
import { Toaster } from '../components/ui/sonner'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <VariablesProvider><OptionsApp /></VariablesProvider>
    <Toaster closeButton />
  </StrictMode>,
)
