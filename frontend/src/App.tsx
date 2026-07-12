import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Configuration from './components/Configuration';
import MasterGrid from './components/MasterGrid';
import ExportPreview from './components/ExportPreview';
import PublicView from './components/PublicView';
import { LoadingProvider } from './contexts/LoadingContext';
import { useStore } from './store/useStore';

// Authentication imports
import { Login } from './components/Login';
import { useAuthStore } from './store/useAuthStore';

function App() {
  const { currentConfig } = useStore();
  
  // Pull authentication state from Zustand
  const token = useAuthStore((state) => state.token);

  // Authenticated route wrapper
  const AuthRoute = ({ children }: { children: JSX.Element }) => {
    return token ? children : <Navigate to="/login" replace />;
  };

  return (
    <LoadingProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/view" element={<PublicView />} />

          {/* Protected Routes */}
          <Route path="/" element={<AuthRoute><Dashboard /></AuthRoute>} />
          <Route 
            path="/configure" 
            element={currentConfig ? <AuthRoute><Configuration /></AuthRoute> : <Navigate to="/" />} 
          />
          <Route 
            path="/grid" 
            element={currentConfig ? <AuthRoute><MasterGrid /></AuthRoute> : <Navigate to="/" />} 
          />
          <Route 
            path="/export" 
            element={currentConfig ? <AuthRoute><ExportPreview /></AuthRoute> : <Navigate to="/" />} 
          />
          
          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LoadingProvider>
  );
}

export default App;