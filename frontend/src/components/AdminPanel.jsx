import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8010';

const AdminPanel = ({ token, onClose }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/admin/users`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUsers(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch users", err);
            setError("Failed to load admin data. Are you an admin?");
            setLoading(false);
        }
    };

    if (loading) return <div className="loading">Loading Admin Panel...</div>;
    if (error) return <div className="error">{error}</div>;

    const totalInteractions = users.reduce((acc, user) => acc + user.total_interactions, 0);
    const totalLikes = users.reduce((acc, user) => acc + user.total_likes, 0);

    return (
        <div style={{ padding: '2rem', background: 'white', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ margin: 0, color: 'var(--primary)' }}>Admin Dashboard</h2>
                <button onClick={onClose} className="btn-outline" style={{ padding: '0.5rem 1rem' }}>Close</button>
            </div>

            {/* Stats Cards */}
            <div className="grid" style={{ marginBottom: '2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <h3 style={{ fontSize: '2rem', margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>{users.length}</h3>
                    <div style={{ color: 'var(--text-muted)' }}>Total Users</div>
                </div>
                <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <h3 style={{ fontSize: '2rem', margin: '0 0 0.5rem 0', color: 'var(--secondary)' }}>{totalInteractions}</h3>
                    <div style={{ color: 'var(--text-muted)' }}>Total Interactions</div>
                </div>
                <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <h3 style={{ fontSize: '2rem', margin: '0 0 0.5rem 0', color: '#10b981' }}>{totalLikes}</h3>
                    <div style={{ color: 'var(--text-muted)' }}>Total Likes</div>
                </div>
            </div>

            {/* Users Table */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                            <th style={{ padding: '1rem' }}>ID</th>
                            <th style={{ padding: '1rem' }}>Email</th>
                            <th style={{ padding: '1rem' }}>Role</th>
                            <th style={{ padding: '1rem' }}>Interactions</th>
                            <th style={{ padding: '1rem' }}>Likes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '1rem' }}>{user.id}</td>
                                <td style={{ padding: '1rem' }}>{user.email}</td>
                                <td style={{ padding: '1rem' }}>
                                    {user.is_admin ? (
                                        <span className="badge" style={{ background: '#fef3c7', color: '#d97706', borderColor: '#fcd34d' }}>Admin</span>
                                    ) : (
                                        <span className="badge" style={{ background: '#e0e7ff', color: '#4f46e5', borderColor: '#c7d2fe' }}>User</span>
                                    )}
                                </td>
                                <td style={{ padding: '1rem' }}>{user.total_interactions}</td>
                                <td style={{ padding: '1rem' }}>{user.total_likes}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminPanel;
