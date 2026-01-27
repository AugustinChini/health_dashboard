import './App.css'

import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'

import AppsPage from './pages/AppsPage'
import AppDetailsPage from './pages/AppDetailsPage'
import DashboardPage from './pages/DashboardPage'

function App() {
  return (
    <HashRouter>
      <div className="page">
        <header className="topbar">
          <div className="topbar__title">
            <div className="brand">
              <div className="brand__mark" aria-hidden="true" />
              <div>
                <div className="brand__name">Health Dashboard</div>
                <div className="brand__subtitle">Monitoring & registry</div>
              </div>
            </div>
          </div>

          <nav className="nav" aria-label="Primary">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? 'nav__link nav__link--active' : 'nav__link')}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/apps"
              className={({ isActive }) => (isActive ? 'nav__link nav__link--active' : 'nav__link')}
            >
              Apps
            </NavLink>
          </nav>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/apps" element={<AppsPage />} />
            <Route path="/apps/:id" element={<AppDetailsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

export default App
