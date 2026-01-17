import React, { useState, useRef, useCallback } from 'react';
import IngredientVisualizer from './IngredientVisualizer';
import axios from 'axios';
import Webcam from 'react-webcam';

const DETECT_ENDPOINT = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8010/recommend').replace('/recommend', '/detect-ingredients');

const RecipeForm = ({ onSubmit, isLoading }) => {
  const [ingredients, setIngredients] = useState('');
  const [prepTime, setPrepTime] = useState(30); // Default 30 mins
  const [cookTime, setCookTime] = useState(45); // Default 45 mins
  const [isDetecting, setIsDetecting] = useState(false);
  const hiddenFileInput = useRef(null);
  const webcamRef = useRef(null);
  const [detectedItems, setDetectedItems] = useState([]);
  const [imagePreview, setImagePreview] = useState(null);
  const [showCamera, setShowCamera] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ingredients,
      prep_time: parseInt(prepTime) || 0,
      cook_time: parseInt(cookTime) || 0,
    });
  };

  const handleClick = () => {
    // If on mobile (basic check), maybe prefer native file picker? 
    // But user asked for camera specifically. Let's toggle our new modal.
    setShowCamera(true);
  };
  
  const handleNativeFileUpload = () => {
      hiddenFileInput.current.click();
  };

  const dataURLtoFile = (dataurl, filename) => {
      let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
      while(n--){
          u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, {type:mime});
  }

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
        const file = dataURLtoFile(imageSrc, 'camera-capture.jpg');
        // Reuse handleImageUpload by simulating an event
        handleImageUpload({ target: { files: [file] } });
        setShowCamera(false);
    }
  }, [webcamRef]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Create preview
    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);

    setIsDetecting(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('text_input', ingredients);

    try {
      const response = await axios.post(DETECT_ENDPOINT, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      const detected = response.data.detected_ingredients;
      if (detected && detected.length > 0) {
        const isObjectList = detected.length > 0 && typeof detected[0] === 'object';
        const detectedNames = detected.map(d => (typeof d === 'object' && d.name) ? d.name : d);
        
        if (isObjectList) {
            setDetectedItems(detected);
        } else {
             setDetectedItems(detected.map(d => ({ name: d, days_to_expiry: null, priority: 'Unknown' })));
        }

        const currentIngredients = ingredients ? ingredients.split(',').map(i => i.trim()).filter(i => i) : [];
        const newIngredients = [...new Set([...currentIngredients, ...detectedNames])];
        setIngredients(newIngredients.join(', '));
      } else {
        alert('No ingredients detected in the image.');
      }
    } catch (err) {
      console.error("Detection Error:", err);
      alert('Failed to detect ingredients. Please try again.');
    } finally {
      setIsDetecting(false);
      // Do NOT clear file input here so we can keep the preview if needed, 
      // or clear it if that's the desired UX. 
      // For now, let's keep the preview until user manually changes it or submits.
      // If we want to allow re-uploading same file, we might need to reset value, 
      // but that kills the "filename" appearing in standard inputs. 
      // Since it's hidden, we can reset it to allow re-triggering change event.
      if (hiddenFileInput.current) hiddenFileInput.current.value = '';
    }
  };

  const clearImage = () => {
      setImagePreview(null);
      setDetectedItems([]);
  };

  const getPriorityColor = (priority, days) => {
      if (days !== null && days <= 3) return '#ef4444'; // Red
      if (priority === 'High') return '#ef4444';
      if (priority === 'Medium') return '#f59e0b'; // Yellow/Orange
      return '#10b981'; // Green
  };

  const handleTextAnalysis = async () => {
    if (!ingredients.trim()) return;

    setIsDetecting(true);
    const formData = new FormData();
    formData.append('text_input', ingredients);

    try {
      const response = await axios.post(DETECT_ENDPOINT, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      const detected = response.data.detected_ingredients;
      if (detected && detected.length > 0) {
        const isObjectList = detected.length > 0 && typeof detected[0] === 'object';
        if (isObjectList) {
            setDetectedItems(detected);
        } else {
             setDetectedItems(detected.map(d => ({ name: d, days_to_expiry: null, priority: 'Unknown' })));
        }
      }
    } catch (err) {
      console.error("Text Analysis Error:", err);
    } finally {
      setIsDetecting(false);
    }
  };

  const getTimeLabel = (mins) => {
      if (mins <= 15) return "Quick Meal ⚡";
      if (mins <= 45) return "Balanced 🍽️";
      return "Elaborate 👨‍🍳";
  };

  return (
    <div className="card recipe-form-card" style={{ maxWidth: '700px', margin: '0 auto', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
      <form onSubmit={handleSubmit}>
        
        {/* Ingredient Input Section */}
        <div className="input-group" style={{ marginBottom: '2rem' }}>
          <label htmlFor="ingredients" className="label" style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'block' }}>
            What's in your kitchen?
          </label>
          
          <div style={{ position: 'relative' }}>
              <textarea
                id="ingredients"
                className="input"
                placeholder="Type ingredients or scan from your fridge..."
                rows="3"
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                required
                style={{ paddingRight: '50px', fontSize: '1rem' }}
              />
              
              {/* Scan Button Inside Input */}
              <input
                  type="file"
                  accept="image/*"
                  ref={hiddenFileInput}
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                  disabled={isDetecting}
              />
              <button 
                  type="button"
                  disabled={isDetecting}
              />
              <button 
                  type="button"
                  onClick={handleClick}
                  title="Scan Ingredients from Photo"
                  style={{ 
                      position: 'absolute',
                      right: '10px',
                      top: '10px',
                      background: 'var(--bg-secondary)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '40px',
                      height: '40px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.2rem',
                      transition: 'transform 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                  {isDetecting ? '⏳' : '📷'}
              </button>
          </div>

          {/* Image Preview Section */}
          {imagePreview && (
              <div style={{ marginTop: '1rem', position: 'relative', display: 'inline-block' }}>
                  <img 
                      src={imagePreview} 
                      alt="Preview" 
                      style={{ 
                          maxHeight: '200px', 
                          maxWidth: '100%', 
                          borderRadius: '8px',
                          border: '2px solid var(--border)' 
                      }} 
                  />
                  <button
                      type="button"
                      onClick={clearImage}
                      title="Remove Image"
                      style={{
                          position: 'absolute',
                          top: '-10px',
                          right: '-10px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}
                  >
                      ×
                  </button>
              </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.8rem' }}>
             <small style={{ color: 'var(--text-muted)' }}>
                Separate ingredients with commas.
             </small>

             {/* Freshness Detection Inline */}
             <button 
                type="button" 
                onClick={handleTextAnalysis} 
                disabled={isDetecting || !ingredients.trim()} 
                title="Automatically detects near-expiry ingredients and prioritizes them."
                className="btn-text"
                style={{ 
                    color: ingredients.trim() ? 'var(--primary)' : 'var(--text-muted)',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: ingredients.trim() ? 'pointer' : 'default'
                }}
            >
                {isDetecting ? 'Analyzing...' : '⚡ Check Freshness'}
            </button>
          </div>
          
          {/* Detected Items Chips */}
          {detectedItems.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {detectedItems.map((item, idx) => (
                      <span key={idx} className="badge" style={{ 
                          background: 'var(--bg-secondary)',
                          border: `1px solid ${getPriorityColor(item.priority, item.days_to_expiry)}`,
                          color: 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                      }}>
                          <span style={{ 
                              width: '8px', 
                              height: '8px', 
                              borderRadius: '50%', 
                              background: getPriorityColor(item.priority, item.days_to_expiry)
                           }}></span>
                          {item.name}
                      </span>
                  ))}
              </div>
          )}
        {detectedItems.length > 0 && imagePreview && (
              <IngredientVisualizer imageSrc={imagePreview} detectedItems={detectedItems} />
          )}

        </div>

        <div style={{ borderTop: '1px solid var(--border)', margin: '0 -2rem 2rem -2rem' }}></div>

        {/* Sliders for Time */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', marginBottom: '2.5rem' }}>
          
          {/* Prep Time Slider */}
          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <label className="label">Prep Time</label>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{prepTime} min</span>
            </div>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={prepTime}
              onChange={(e) => setPrepTime(Number(e.target.value))}
              className="range-slider"
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                <span>5m</span>
                <span>{getTimeLabel(prepTime)}</span>
                <span>60m</span>
            </div>
          </div>

          {/* Cook Time Slider */}
          <div className="input-group">
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <label className="label">Cook Time</label>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{cookTime} min</span>
            </div>
            <input
              type="range"
              min="5"
              max="120"
              step="5"
              value={cookTime}
              onChange={(e) => setCookTime(Number(e.target.value))}
              className="range-slider"
              style={{ width: '100%' }}
            />
             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                <span>5m</span>
                <span>{getTimeLabel(cookTime)}</span>
                <span>2h</span>
            </div>
          </div>
        </div>

        <button 
            type="submit" 
            className="btn btn-gradient" 
            disabled={isLoading} 
            style={{ 
                width: '100%', 
                padding: '1rem', 
                fontSize: '1.1rem', 
                borderRadius: '12px',
                background: 'linear-gradient(135deg, var(--primary) 0%, #ec4899 100%)',
                color: 'white',
                border: 'none',
                boxShadow: '0 4px 15px rgba(225, 29, 72, 0.4)'
            }}
        >
          {isLoading ? 'Cooking up ideas...' : 'Generate Personalized Recipes ✨'}
        </button>
      </form>


      {/* Camera Modal */}
      {showCamera && (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
        }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '640px' }}>
                <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    style={{ width: '100%', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
                    videoConstraints={{ facingMode: "environment" }}
                />
                <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                     <button 
                        type="button"
                        onClick={() => setShowCamera(false)} 
                        className="btn" 
                        style={{
                            background: 'rgba(255,255,255,0.2)', 
                            color: 'white',
                            border: '1px solid rgba(255,255,255,0.3)'
                        }}
                    >
                        Cancel
                    </button>
                    
                    {/* Fallback to file picker if camera fails or user prefers it */}
                    <button 
                        type="button"
                        onClick={() => { setShowCamera(false); handleNativeFileUpload(); }}
                        className="btn" 
                        style={{
                            background: 'rgba(255,255,255,0.2)', 
                            color: 'white', 
                             border: '1px solid rgba(255,255,255,0.3)'
                        }}
                    >
                        📁 Upload File
                    </button>

                     <button 
                        type="button"
                        onClick={capture} 
                        className="btn" 
                        style={{
                            background: 'var(--primary)', 
                            color: 'white',
                            padding: '0.8rem 2rem',
                            fontWeight: 'bold',
                            border: 'none',
                            boxShadow: '0 0 15px var(--primary)'
                        }}
                    >
                        Capture Photo 📸
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default RecipeForm;
