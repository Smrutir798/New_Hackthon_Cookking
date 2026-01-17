
import React, { useState } from 'react';
import axios from 'axios';
import RecipeForm from '../components/RecipeForm';
import RecipeList from '../components/RecipeList';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8010';

const Home = ({ userProfile, onInteraction }) => {
  const [recipes, setRecipes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRecommendations = async (inputData) => {
    setLoading(true);
    setError(null);
    setRecipes(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/recommend`, inputData, {
        headers: {
          'Content-Type': 'application/json',
        }
      });
      console.log("API Response:", response.data);
      setRecipes(response.data);
    } catch (err) {
      console.error("API Error:", err);
      const errorMessage = err.response?.data?.detail || err.message || 'Unknown error';
      setError(`Failed to fetch recommendations: ${errorMessage}. Please ensure the backend is running on port 8010.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <RecipeForm onSubmit={fetchRecommendations} isLoading={loading} />

      {error && (
        <div className="error" style={{ marginTop: '2rem' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="loading">
          Cooking up recommendations...
        </div>
      )}

      {!loading && recipes && (
        <div style={{ marginTop: '3rem' }}>
           <h2 style={{ textAlign: 'center', marginBottom: '2rem', fontSize: '2rem' }}>Your Recommendations</h2>
           <RecipeList 
              recipes={recipes} 
              onInteraction={onInteraction}
           />
        </div>
      )}
    </main>
  );
};

export default Home;
