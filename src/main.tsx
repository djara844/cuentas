import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { prepareNative } from './native'
import './styles.css'

void prepareNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
