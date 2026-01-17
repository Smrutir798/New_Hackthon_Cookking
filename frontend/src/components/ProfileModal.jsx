
import React, { useState, useEffect } from 'react';

const DIET_OPTIONS = ["Vegetarian", "Vegan", "Gluten-Free", "Keto", "Paleo"];
const EXP_LEVELS = ["Beginner", "Intermediate", "Advanced"];

function ProfileModal({ isOpen, onClose, profile, onSave }) {
    if (!isOpen) return null;

    const [name, setName] = useState('');
    const [experience, setExperience] = useState('Intermediate');
    const [diets, setDiets] = useState([]);
    const [allergies, setAllergies] = useState('');
    
    // Initialize state from profile prop interactions
    useEffect(() => {
        if (profile) {
            setName(profile.name || '');
            setExperience(profile.experience_level || 'Intermediate');
            setDiets(profile.dietary_preferences || []);
            setAllergies((profile.allergies || []).join(', '));
        }
    }, [profile]);

    // Liked Recipes logic moved to App.jsx

    const handleDietToggle = (diet) => {
        if (diets.includes(diet)) {
            setDiets(diets.filter(d => d !== diet));
        } else {
            setDiets([...diets, diet]);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const updatedProfile = {
            name,
            experience_level: experience,
            dietary_preferences: diets,
            allergies: allergies.split(',').map(s => s.trim()).filter(Boolean)
        };
        onSave(updatedProfile);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="close-btn" onClick={onClose}>&times;</button>
                
                <h2 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>Your Taste Profile</h2>
                
                <form onSubmit={handleSubmit}>
                    {/* Basic Info */}
                    <div className="form-section">
                        <label className="label">Name</label>
                        <input 
                            className="input" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            placeholder="Your Name"
                        />
                    </div>

                    <div className="form-section">
                        <label className="label">Cooking Skill</label>
                        <select 
                            className="input" 
                            value={experience} 
                            onChange={e => setExperience(e.target.value)}
                        >
                            {EXP_LEVELS.map(lvl => (
                                <option key={lvl} value={lvl}>{lvl}</option>
                            ))}
                        </select>
                    </div>

                    {/* Dietary Defaults */}
                    <div className="form-section">
                        <label className="label">Dietary Preferences</label>
                        <div className="checkbox-group">
                            {DIET_OPTIONS.map(diet => (
                                <label 
                                    key={diet} 
                                    className={`checkbox-label ${diets.includes(diet) ? 'selected' : ''}`}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={diets.includes(diet)}
                                        onChange={() => handleDietToggle(diet)}
                                        style={{ display: 'none' }}
                                    />
                                    <span>{diet}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Allergies */}
                    <div className="form-section">
                        <label className="label">Allergies / Restrictions</label>
                        <input 
                            className="input" 
                            value={allergies} 
                            onChange={e => setAllergies(e.target.value)} 
                            placeholder="e.g., Peanuts, Shellfish, Soy (comma separated)"
                        />
                         <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem'}}>
                            Recipes containing these ingredients will be filtered out.
                        </p>
                    </div>

                    <button type="submit" className="btn">Save Profile</button>
                </form>

            </div>
        </div>
    );
}

export default ProfileModal;
