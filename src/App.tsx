import "./App.css";

import { useCallback, useEffect, useState } from "react";
import { HashRouter, NavLink, Route, Routes } from "react-router-dom";

import { getStoredAuthToken, verifyAuthToken } from "./api/apps";
import AppsPage from "./pages/AppsPage";
import AppDetailsPage from "./pages/AppDetailsPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import NotificationsPage from "./pages/NotificationsPage";

function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  const checkAuth = useCallback(async () => {
    const token = getStoredAuthToken();
    if (!token) {
      setAuthed(false);
      return;
    }
    const valid = await verifyAuthToken();
    setAuthed(valid);
  }, []);

  useEffect(() => {
    checkAuth();

    const onLogout = () => setAuthed(false);
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, [checkAuth]);

  if (authed === null) {
    return null;
  }

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

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
              className={({ isActive }) =>
                isActive ? "nav__link nav__link--active" : "nav__link"
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/apps"
              className={({ isActive }) =>
                isActive ? "nav__link nav__link--active" : "nav__link"
              }
            >
              Apps
            </NavLink>
            <NavLink
              to="/notifications"
              className={({ isActive }) =>
                isActive ? "nav__link nav__link--active" : "nav__link"
              }
            >
              Notifications
            </NavLink>
          </nav>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/apps" element={<AppsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/apps/:id" element={<AppDetailsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

export default App;
