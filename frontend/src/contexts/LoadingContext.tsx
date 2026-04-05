import React, { createContext, useContext, useState, useCallback } from 'react';

interface LoadingContextType {
  loading: boolean;
  loadingMessage: string;
  setLoading: (loading: boolean, message?: string) => void;
  withLoading: <T>(fn: () => Promise<T>, message?: string) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextType>({
  loading: false,
  loadingMessage: 'Processing...',
  setLoading: () => {},
  withLoading: async (fn) => fn(),
});

export const useLoading = () => useContext(LoadingContext);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoadingState] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');

  const setLoading = useCallback((isLoading: boolean, message?: string) => {
    setLoadingState(isLoading);
    if (message) setLoadingMessage(message);
    if (!isLoading) setLoadingMessage('Processing...');
  }, []);

  const withLoading = useCallback(async <T,>(fn: () => Promise<T>, message?: string): Promise<T> => {
    setLoading(true, message);
    try {
      return await fn();
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  return (
    <LoadingContext.Provider value={{ loading, loadingMessage, setLoading, withLoading }}>
      {children}
      {loading && <LoadingOverlay message={loadingMessage} />}
    </LoadingContext.Provider>
  );
}

/* ════════════════════════════════════════════════════
   PREMIUM LOADING OVERLAY
   ════════════════════════════════════════════════════ */
function LoadingOverlay({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(13, 15, 20, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: 'loaderFadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          padding: '40px 56px',
          borderRadius: 24,
          background: 'linear-gradient(145deg, rgba(28, 31, 42, 0.95), rgba(38, 42, 54, 0.92))',
          border: '1px solid rgba(196, 181, 253, 0.15)',
          boxShadow: `
            0 32px 80px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(196, 181, 253, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.04)
          `,
          animation: 'loaderSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Animated spinner */}
        <div style={{ position: 'relative', width: 56, height: 56 }}>
          {/* Outer ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '3px solid rgba(196, 181, 253, 0.1)',
            }}
          />
          {/* Spinning arc */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '3px solid transparent',
              borderTopColor: '#C4B5FD',
              borderRightColor: '#A78BFA',
              animation: 'loaderSpin 0.8s linear infinite',
            }}
          />
          {/* Inner glow dot */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)',
              boxShadow: '0 0 16px rgba(196, 181, 253, 0.5)',
              animation: 'loaderPulse 1.5s ease-in-out infinite',
            }}
          />
        </div>

        {/* Message */}
        <p
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            color: '#E5E7EB',
            letterSpacing: '-0.01em',
            fontFamily: "'Inter', sans-serif",
            animation: 'loaderTextPulse 2s ease-in-out infinite',
          }}
        >
          {message}
        </p>

        {/* Subtle progress bar */}
        <div
          style={{
            width: 120,
            height: 3,
            borderRadius: 2,
            background: 'rgba(196, 181, 253, 0.1)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '40%',
              height: '100%',
              borderRadius: 2,
              background: 'linear-gradient(90deg, #C4B5FD, #A78BFA)',
              animation: 'loaderProgress 1.5s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      {/* Injected keyframes */}
      <style>{`
        @keyframes loaderFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes loaderSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes loaderSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes loaderPulse {
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
        }
        @keyframes loaderTextPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes loaderProgress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

export default LoadingProvider;
