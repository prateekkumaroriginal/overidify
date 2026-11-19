import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { VariablesProvider } from '../components/VariablesProvider'
import { PopupApp } from './PopupApp'
import { TooltipProvider } from '../components/ui/tooltip'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={350}>
      <VariablesProvider><PopupApp /></VariablesProvider>
    </TooltipProvider>
  </StrictMode>,
)
