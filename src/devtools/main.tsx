import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { VariablesProvider } from '../components/VariablesProvider'
import { DevtoolsApp } from './DevtoolsApp'

createRoot(document.getElementById('app')!).render(<StrictMode><VariablesProvider><DevtoolsApp /></VariablesProvider></StrictMode>)
