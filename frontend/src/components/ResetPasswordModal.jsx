import React, { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8010';

const ResetPasswordModal = ({ token, onClose, onSuccess }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        try {
            await axios.post(`${API_BASE_URL}/reset-password`, { 
                token: token, 
                new_password: password 
            });
            setMessage("Password reset successfully! You can now login.");
            setTimeout(() => {
                onSuccess();
            }, 2000);
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to reset password. Token may be invalid or expired.");
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button className="close-btn" onClick={onClose}>&times;</button>
                
                <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>Reset Password</h2>
                
                {error && <div className="error">{error}</div>}
                {message && <div className="success" style={{ 
                    background: '#ecfdf5', color: '#059669', padding: '1rem', 
                    borderRadius: '12px', marginBottom: '1rem', textAlign: 'center', fontWeight: '600' 
                }}>{message}</div>}

                {!message && (
                    <form onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label className="label">New Password</label>
                            <input 
                                type="password" 
                                className="input" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                                minLength={6}
                            />
                        </div>
                        <div className="input-group">
                            <label className="label">Confirm Password</label>
                            <input 
                                type="password" 
                                className="input" 
                                value={confirmPassword} 
                                onChange={(e) => setConfirmPassword(e.target.value)} 
                                required 
                            />
                        </div>
                        
                        <button type="submit" className="btn" disabled={loading}>
                            {loading ? 'Reseting...' : 'Set New Password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ResetPasswordModal;
