import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import NominaSmoke from './NominaSmoke'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NominaSmoke />
  </StrictMode>,
)
