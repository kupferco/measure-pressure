import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { PatientPage } from './pages/Patient';
import { PatientsPage } from './pages/Patients';
import { SignInPage } from './pages/SignIn';
import { VerifyPage } from './pages/Verify';

export function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  // /verify is reached from a link in an email, before a session exists.
  const isPublic = location.pathname === '/sign-in' || location.pathname === '/verify';
  if (!user && !isPublic) return <Navigate to="/sign-in" replace />;
  if (user && location.pathname === '/sign-in') return <Navigate to="/" replace />;

  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/" element={<PatientsPage />} />
      <Route path="/patients/:id" element={<PatientPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
