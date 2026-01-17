
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import ProfileModal from './components/ProfileModal';
import AuthModal from './components/AuthModal';
import Sidebar from './components/Sidebar';
import AdminPanel from './components/AdminPanel';
import ResetPasswordModal from './components/ResetPasswordModal';
import axios from 'axios';
import Home from './pages/Home';
import CookingMode from './pages/CookingMode';
import './index.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8010';

function AppContent() {
  const location = useLocation();
  const [userProfile, setUserProfile] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('auth_token'));
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [resetToken, setResetToken] = useState(null);

  // Check if we are in cooking mode to hide standard layout
  const isCookingMode = location.pathname.startsWith('/cook/');

  useEffect(() => {
    // Check for Reset Token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const rToken = urlParams.get('token');
    // We check against location.pathname from router or window? 
    // window.location.pathname is reliable for initial load
    if (rToken && (window.location.pathname === '/reset-password' || location.pathname === '/reset-password')) {
        setResetToken(rToken);
        window.history.replaceState({}, document.title, window.location.pathname); 
    }

    if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        fetchProfile();
    } else {
        delete axios.defaults.headers.common['Authorization'];
        setUserProfile(null);
    }
  }, [token, location]);

  const fetchProfile = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/profile`);
      setUserProfile(res.data);
    } catch (err) {
      console.error("Failed to fetch profile", err);
      if (err.response && err.response.status === 401) {
          handleLogout();
      }
    }
  };

  const handleSaveProfile = async (updatedProfile) => {
      try {
          const res = await axios.post(`${API_BASE_URL}/profile`, updatedProfile);
          setUserProfile(res.data);
          setIsProfileOpen(false);
          alert("Profile saved!");
      } catch (err) {
          console.error("Failed to save profile", err);
          alert("Failed to save profile.");
      }
  };
  
  const handleLogin = async (email, password, isRegistering) => {
      const endpoint = isRegistering ? '/register' : '/token';
      let data;
      let config = {};
      
      if (isRegistering) {
          data = { email, password };
      } else {
          const formData = new FormData();
          formData.append('username', email);
          formData.append('password', password);
          data = formData;
          config = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
      }
      
      const res = await axios.post(`${API_BASE_URL}${endpoint}`, data, config);
      const newToken = res.data.access_token;
      
      localStorage.setItem('auth_token', newToken);
      setToken(newToken);
      setIsAuthOpen(false);
  };
  
  const handleLogout = () => {
      localStorage.removeItem('auth_token');
      setToken(null);
      setUserProfile(null);
  };

  const handleInteraction = async (action, recipeName, details = {}) => {
      if (!token) return; 
      
      const newInteraction = { 
          action, 
          recipe_name: recipeName, 
          details, 
          timestamp: new Date().toISOString() 
      };

      setUserProfile(prev => {
          if (!prev) return prev;
          const currentInteractions = prev.interactions || [];
          return { 
              ...prev, 
              interactions: [...currentInteractions, newInteraction] 
          };
      });

      try {
          await axios.post(`${API_BASE_URL}/interaction`, {
              action,
              recipe_name: recipeName,
              details
          });
      } catch (err) {
          console.error("Failed to log interaction", err);
      }
  };

  // Derived state
  const likedRecipes = React.useMemo(() => {
    if (!userProfile?.interactions) return [];
    const likes = new Set();
    userProfile.interactions.forEach(i => {
        if (i.action === 'like') likes.add(i.recipe_name);
        else if (i.action === 'unlike') likes.delete(i.recipe_name);
    });
    return Array.from(likes);
  }, [userProfile]);

  // Render Immersive Mode
  if (isCookingMode) {
      return (
        <Routes>
            <Route path="/cook/:recipeId" element={<CookingMode />} />
        </Routes>
      );
  }

  // Render Standard Layout
  return (
    <div className="container">
      <header style={{ marginBottom: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        
        <Sidebar 
            isOpen={isSidebarOpen} 
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
            likedRecipes={likedRecipes} 
            onInteraction={handleInteraction}
        />

        <div style={{ position: 'absolute', right: 0, top: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
             {token ? (
               <>
                 {userProfile && (
                     <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'none', md: 'block' }}>
                         <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text)', border: 'none' }}>
                             {userProfile.experience_level || 'Chef'}
                         </span>
                         {userProfile.dietary_preferences?.length > 0 && (
                            <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--primary)', border: 'none', marginLeft: '0.5rem' }}>
                                {userProfile.dietary_preferences[0]}
                            </span>
                         )}
                     </div>
                 )}

                 {userProfile?.is_admin && (
                     <button 
                        className="btn btn-outline" 
                        onClick={() => setIsAdminOpen(true)}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', borderColor: '#fcd34d', color: '#d97706', background: '#fffbeb' }}
                     >
                        👑 Admin
                     </button>
                 )}

                 <button className="btn btn-outline" onClick={() => setIsProfileOpen(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                    👤 {userProfile?.name || 'Profile'}
                 </button>
                 <button className="btn btn-outline" onClick={handleLogout} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', borderColor: '#ef4444', color: '#ef4444' }}>
                    Logout
                 </button>
              </>
            ) : (
                <button className="btn" onClick={() => setIsAuthOpen(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                    Login / Register
                </button>
            )}
        </div>

        <h1 className="title">AI Culinary Assistant</h1>
        <p className="subtitle">Discover personalized recipes matched to your ingredients and time.</p>
      </header>
      
      {isAdminOpen && (
          <div className="modal-overlay">
             <div className="modal-content" style={{ maxWidth: '900px', width: '95%' }}>
                 <AdminPanel token={token} onClose={() => setIsAdminOpen(false)} />
             </div>
          </div>
      )}

      {resetToken && (
          <ResetPasswordModal 
              token={resetToken} 
              onClose={() => setResetToken(null)}
              onSuccess={() => {
                  setResetToken(null);
                  setIsAuthOpen(true); 
              }}
          />
      )}

      <AuthModal 
          isOpen={isAuthOpen} 
          onClose={() => setIsAuthOpen(false)}
          onLogin={handleLogin}
      />

      <ProfileModal 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        profile={userProfile} 
        onSave={handleSaveProfile} 
      />
      
      <Routes>
          <Route path="/" element={<Home userProfile={userProfile} onInteraction={handleInteraction} />} />
          <Route path="/reset-password" element={<Home userProfile={userProfile} onInteraction={handleInteraction} />} />
      </Routes>
      
      <footer style={{ marginTop: '5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        <p>© 2026 AI Cooking. Powered by Machine Learning.</p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
