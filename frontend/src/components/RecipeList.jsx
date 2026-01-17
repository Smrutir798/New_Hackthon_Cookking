import React from 'react';
import RecipeCard from './RecipeCard';

const RecipeList = ({ recipes, onInteraction }) => {
  if (!recipes || recipes.length === 0) {
    return (
      <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-muted)' }}>
        <p>No recipes found yet. Try adding different ingredients!</p>
      </div>
    );
  }

  return (
    <div className="grid">
      {recipes.map((recipe, index) => (
        <RecipeCard key={index} recipe={recipe} onInteraction={onInteraction} />
      ))}
    </div>
  );
};

export default RecipeList;
