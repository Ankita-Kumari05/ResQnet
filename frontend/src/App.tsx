import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { OnlineProvider } from './contexts/OnlineContext'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import CitizenDashboard from './pages/CitizenDashboard'
import ResponderDashboard from './pages/ResponderDashboard'
import CoordinatorDashboard from './pages/CoordinatorDashboard'
import FundraisingPage from './pages/FundraisingPage'
import EmergencyScreen from './pages/EmergencyScreen'
import AdminDashboard from './pages/AdminDashboard'
import './index.css'

function ProtectedRoutes() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div className="spinner spinner-lg" />
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>
          Initializing ResQnet…
        </p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  const isAdmin = user.role === 'admin' || user.email === 'admin@resqnet.in'

  const dashboardByRole = () => {
    if (isAdmin) return <AdminDashboard />
    switch (user.role) {
      case 'coordinator': return <CoordinatorDashboard />
      case 'responder':   return <ResponderDashboard />
      case 'fundraiser':  return <FundraisingPage />
      default:            return <CitizenDashboard />
    }
  }

  // Citizen gets map-first layout with no sidebar (AppShell noSidebar mode)
  const isCitizen = user.role === 'citizen' && !isAdmin

  return (
    <AppShell
      noSidebar={isCitizen}
      noHeader={isCitizen}
      showLive={true}
      pageTitle={
        isAdmin                     ? 'Administration & Governance Console' :
        user.role === 'coordinator' ? 'ResQnet EOC' :
        user.role === 'responder'   ? 'Field Response Console' :
        user.role === 'fundraiser'  ? 'Relief Campaigns' :
        undefined
      }
    >
      <Routes>
        <Route path="/"              element={dashboardByRole()} />
        {/* Admin routes — always AdminDashboard for admin users, regardless of DB role */}
        <Route path="/admin"         element={isAdmin ? <AdminDashboard /> : <Navigate to="/" replace />} />
        <Route path="/map"           element={<CitizenDashboard />} />
        <Route path="/emergency"     element={<EmergencyScreen />} />
        {/* Role-guarded routes — admin must NOT reach coordinator/responder dashboards */}
        <Route path="/responder"     element={isAdmin ? <Navigate to="/admin" replace /> : <ResponderDashboard />} />
        <Route path="/missions"      element={isAdmin ? <Navigate to="/admin" replace /> : <ResponderDashboard />} />
        <Route path="/coordinator"   element={isAdmin ? <Navigate to="/admin" replace /> : <CoordinatorDashboard />} />
        <Route path="/fundraising"   element={<FundraisingPage />} />
        <Route path="/donate/:slug"  element={<FundraisingPage />} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OnlineProvider>
          <Routes>
            <Route path="/login"           element={<LoginPage />} />
            <Route path="/forgot-password" element={<LoginPage />} />
            <Route path="/reset-password"  element={<LoginPage />} />
            <Route path="/register"        element={<RegisterPage />} />
            <Route path="/*"               element={<ProtectedRoutes />} />
          </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#ffffff',
                color: '#0b1c30',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                fontFamily: "'Public Sans', system-ui",
                boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              },
              success: { iconTheme: { primary: '#16a34a', secondary: 'transparent' } },
              error:   { iconTheme: { primary: '#dc2626', secondary: 'transparent' } },
            }}
          />
        </OnlineProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
