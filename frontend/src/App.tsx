import React, { useState, useEffect } from 'react';
import { VillageDashboard } from './components/VillageDashboard';
import { AuthModal } from './components/AuthModal';

export default function App() {
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('username');
    const token = localStorage.getItem('token');
    if (savedUser && token) setUser(savedUser);

    // api.ts fires this when the server rejects our token (401).
    const onForcedLogout = () => setUser(null);
    window.addEventListener('auth:logout', onForcedLogout);
    return () => window.removeEventListener('auth:logout', onForcedLogout);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {!user ? (
        <AuthModal onLoginSuccess={(username) => setUser(username)} />
      ) : (
        <div>
          <div className="bg-slate-800/60 border-b border-slate-700/50 px-6 py-3 flex justify-between items-center text-xs">
            <span className="text-slate-400">
              Logged in as: <strong className="text-amber-400">{user}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 font-semibold cursor-pointer"
            >
              Logout
            </button>
          </div>

          <VillageDashboard username={user} />
        </div>
      )}
    </div>
  );
}
