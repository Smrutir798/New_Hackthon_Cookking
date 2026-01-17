import React, { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8010';

const AuthModal = ({ isOpen, onClose, onLogin }) => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [isRecovery, setIsRecovery] = useState(false); // Forgot Password Mode
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg('');

        try {
            if (isRecovery) {
                // Recovery Flow
                await axios.post(`${API_BASE_URL}/forgot-password`, { email });
                setSuccessMsg("Recovery link sent! Check your email (or server console).");
            } else {
                // Login/Register Flow
                await onLogin(email, password, isRegistering);
                onClose();
            }
        } catch (err) {
            setError(err.response?.data?.detail || "Authentication failed");
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button className="close-btn" onClick={onClose}>&times;</button>
                
                <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>
                    {isRecovery ? 'Recover Password' : (isRegistering ? 'Create Account' : 'Welcome Back')}
                </h2>
                
                {error && <div className="error">{error}</div>}
                {successMsg && <div className="success" style={{ 
                    background: '#ecfdf5', color: '#059669', padding: '1rem', 
                    borderRadius: '12px', marginBottom: '1rem', textAlign: 'center', fontWeight: '600' 
                }}>{successMsg}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label className="label">Email Address</label>
                        <input 
                            type="email" 
                            className="input" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                        />
                    </div>
                    
                    {!isRecovery && (
                        <div className="input-group">
                            <label className="label">Password</label>
                            <input 
                                type="password" 
                                className="input" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                            />
                        </div>
                    )}

                    <button type="submit" className="btn" style={{ marginBottom: '1rem' }}>
                        {isRecovery ? 'Send Recovery Link' : (isRegistering ? 'Register' : 'Login')}
                    </button>
                    
                    {!isRecovery && (
                        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                            <button 
                                type="button" 
                                className="btn-text" 
                                style={{ color: 'var(--text-muted)', fontSize: '0.9rem', cursor: 'pointer' }}
                                onClick={() => { setIsRecovery(true); setError(null); setSuccessMsg(''); }}
                            >
                                Forgot Password?
                            </button>
                        </div>
                    )}

                    <div style={{ textAlign: 'center' }}>
                        <button 
                            type="button" 
                            className="btn-text" 
                            style={{ color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => { 
                                if (isRecovery) {
                                    setIsRecovery(false); 
                                } else {
                                    setIsRegistering(!isRegistering); 
                                }
                                setError(null);
                                setSuccessMsg('');
                            }}
                        >
                            {isRecovery ? 'Back to Login' : (isRegistering ? 'Already have an account? Login' : 'New here? Create Account')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AuthModal;
