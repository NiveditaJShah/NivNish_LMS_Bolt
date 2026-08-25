import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LoadingSpinner } from '@/components/ui';
import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import StudentDashboard from '@/pages/student/StudentDashboard';
import AssessmentAttempt from '@/pages/student/AssessmentAttempt';
import MyResults from '@/pages/student/MyResults';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import StudentManagement from '@/pages/admin/StudentManagement';
import AssessmentBuilder from '@/pages/admin/AssessmentBuilder';
import ResultsMonitoring from '@/pages/admin/ResultsMonitoring';
import AppLayout from '@/components/AppLayout';
import type { UserRole } from '@/types';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: UserRole[] }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingSpinner size={32} />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <LoadingSpinner size={32} />;

  if (profile.status === 'deactivated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Account Deactivated</h1>
          <p className="text-slate-500 text-sm">Your account has been deactivated. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAdmin = profile?.role === 'admin';

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              {isAdmin ? <AdminDashboard /> : <StudentDashboard />}
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/assessment/:assessmentId"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <AssessmentAttempt />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/my-results"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <AppLayout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <MyResults />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/students"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AppLayout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <StudentManagement />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/assessments"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AppLayout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <AssessmentBuilder />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/results"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AppLayout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
              <ResultsMonitoring />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
