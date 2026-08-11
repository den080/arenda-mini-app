import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import LandlordDashboard from './pages/LandlordDashboard'
import TenantDashboard from './pages/TenantDashboard'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/landlord" element={<LandlordDashboard />} />
        <Route path="/tenant" element={<TenantDashboard />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
