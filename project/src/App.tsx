import { lazy, Suspense, useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import Auth from '@/components/Auth';
import Layout, { View } from '@/components/Layout';
import ResetPassword from '@/components/ResetPassword';

// Each page is its own download, fetched the first time it's opened, so
// the app starts quickly (PDF/Excel libraries only load where they're used).
const Dashboard = lazy(() => import('@/components/Dashboard'));
const Patients = lazy(() => import('@/components/Patients'));
const Hospitals = lazy(() => import('@/components/Hospitals'));
const Revenue = lazy(() => import('@/components/Revenue'));
const Reports = lazy(() => import('@/components/Reports'));
const ConsentProformas = lazy(() => import('@/components/ConsentProformas'));
const SurgicalLogbook = lazy(() => import('@/components/SurgicalLogbook'));
const COLDashboard = lazy(() => import('@/components/COLDashboard'));
const Sharing = lazy(() => import('@/components/Sharing'));
const Publications = lazy(() => import('@/components/Publications'));

const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
  </div>
);

function AppContent() {
  const { session, loading, passwordRecovery } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [focusPatientId, setFocusPatientId] = useState<string | null>(null);
  const openPatient = (id: string) => { setFocusPatientId(id); setView('patients'); };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (passwordRecovery) {
    return <ResetPassword />;
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <Layout current={view} onNavigate={setView} onOpenPatient={openPatient}>
      <Suspense fallback={<Spinner />}>
        {view === 'dashboard' && <Dashboard onNavigate={setView} />}
        {view === 'patients' && <Patients focusPatientId={focusPatientId} onFocusHandled={() => setFocusPatientId(null)} />}
        {view === 'hospitals' && <Hospitals />}
        {view === 'revenue' && <Revenue />}
        {view === 'reports' && <Reports />}
        {view === 'consent' && <ConsentProformas />}
        {view === 'logbook' && <SurgicalLogbook />}
        {view === 'col' && <COLDashboard />}
        {view === 'sharing' && <Sharing />}
        {view === 'publications' && <Publications />}
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
