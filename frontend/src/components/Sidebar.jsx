
import React from 'react';

const Sidebar = ({ isOpen, toggleSidebar, likedRecipes, onInteraction }) => {
    return (
        <>
            {/* Toggle Button (Visible when closed) */}
            {!isOpen && (
                <button 
                    onClick={toggleSidebar}
                    className="sidebar-toggle-btn"
                    title="View Liked Recipes"
                >
                    ❤️
                </button>
            )}

            {/* Sidebar Container */}
            <div className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <h3>Liked Recipes</h3>
                    <button onClick={toggleSidebar} className="close-btn">&times;</button>
                </div>
                
                <div className="sidebar-content">
                    {likedRecipes.length === 0 ? (
                        <p className="empty-state">No liked recipes yet. Click the heart on recipes you love!</p>
                    ) : (
                        <div className="liked-list">
                            {likedRecipes.map((recipe, idx) => (
                                <div key={idx} className="liked-item-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <a 
                                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(recipe)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="liked-item"
                                        style={{ flex: 1, textDecoration: 'none', color: 'inherit', marginRight: '0.5rem' }}
                                    >
                                        {recipe} ↗
                                    </a>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation(); 
                                            // Optimistic update handled by parent or verify if we need to confirm
                                            if(onInteraction) onInteraction('unlike', recipe);
                                        }}
                                        className="delete-liked-btn"
                                        style={{ 
                                            background: 'none', 
                                            border: 'none', 
                                            cursor: 'pointer', 
                                            color: '#ef4444', 
                                            fontSize: '1.2rem',
                                            padding: '0 0.5rem',
                                            lineHeight: 1
                                        }}
                                        title="Remove from liked"
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Overlay for mobile */}
            {isOpen && <div className="sidebar-overlay" onClick={toggleSidebar}></div>}
        </>
    );
};

export default Sidebar;
