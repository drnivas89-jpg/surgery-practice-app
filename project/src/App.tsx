import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import Auth from '@/components/Auth';
import Layout, { View } from '@/components/Layout';
import Dashboard from '@/components/Dashboard';
import Patients from '@/components/Patients';
import Hospitals from '@/components/Hospitals';
import Revenue from '@/components/Revenue';
import Reports from '@/components/Reports';
import ConsentProformas from '@/components/ConsentProformas';
import SurgicalLogbook from '@/components/SurgicalLogbook';
import COLDashboard from '@/components/COLDashboard';
import Sharing from '@/components/Sharing';

function AppContent() {
  const { session, loading } = useAuth();
  const [view, setView] = useState<View>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <Layout current={view} onNavigate={setView}>
      {view === 'dashboard' && <Dashboard onNavigate={setView} />}
      {view === 'patients' && <Patients />}
      {view === 'hospitals' && <Hospitals />}
      {view === 'revenue' && <Revenue />}
      {view === 'reports' && <Reports />}
      {view === 'consent' && <ConsentProformas />}
      {view === 'logbook' && <SurgicalLogbook />}
      {view === 'col' && <COLDashboard />}
      {view === 'sharing' && <Sharing />}
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
