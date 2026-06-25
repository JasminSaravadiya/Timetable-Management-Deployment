import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Configuration from './components/Configuration';
import MasterGrid from './components/MasterGrid';
import ExportPreview from './components/ExportPreview';
import { LoadingProvider } from './contexts/LoadingContext';
import { useStore } from './store/useStore';

// Authentication imports
import { Login } from './components/Login';
import { useAuthStore } from './store/useAuthStore';

function App() {
  const { currentConfig } = useStore();
  
  // Pull authentication state from Zustand
  const token = useAuthStore((state) => state.token);

  // GLOBAL GUARD: If the user has no token, completely block the app and render Login
  if (!token) {
    return <Login />;
  }

  // If token exists, render the actual router and application
  return (
    <LoadingProvider>

      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route 
            path="/configure" 
            element={currentConfig ? <Configuration /> : <Navigate to="/" />} 
          />
          <Route 
            path="/grid" 
            element={currentConfig ? <MasterGrid /> : <Navigate to="/" />} 
          />
          <Route 
            path="/export" 
            element={currentConfig ? <ExportPreview /> : <Navigate to="/" />} 
          />
          {/* Catch-all: redirect unknown routes to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LoadingProvider>
  );
}

export default App;