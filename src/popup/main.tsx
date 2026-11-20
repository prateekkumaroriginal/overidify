import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { PopupApp } from './PopupApp'
import { TooltipProvider } from '../components/ui/tooltip'
import { VariablesProvider } from '../components/VariablesProvider'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <VariablesProvider>
      <TooltipProvider delayDuration={350}>
        <PopupApp />
      </TooltipProvider>
    </VariablesProvider>
  </StrictMode>,
)
