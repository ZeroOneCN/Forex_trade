import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { I18nProvider } from './i18n/I18nProvider'
import './index.css'

// 全局禁止 number 输入框通过鼠标滚轮改变数值
document.addEventListener('wheel', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type === 'number') {
    e.target.blur()
  }
}, { passive: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
)
