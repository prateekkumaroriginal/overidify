import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { OptionsApp } from './OptionsApp'
import { Toaster } from '../components/ui/sonner'
import { VariablesProvider } from '../components/VariablesProvider'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <VariablesProvider>
      <OptionsApp />
    </VariablesProvider>
    <Toaster closeButton />
  </StrictMode>,
)
