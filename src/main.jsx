import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { resolveEntryRoute } from './lib/router.js'

// 첫 화면 정하기: ?teacher= → 그 강사, #/경로 → 그 화면, 기억한 강사 → 강사 화면, 없으면 홈
resolveEntryRoute()

// 앱처럼 쓰기(PWA): 정적 파일만 캐시하는 서비스워커. 개발 서버에서는 등록하지 않는다
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
