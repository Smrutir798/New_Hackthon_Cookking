import React, { useEffect, useState } from 'react';

const IngredientVisualizer = ({ imageSrc, detectedItems }) => {
  const [crops, setCrops] = useState({});

  useEffect(() => {
    if (!imageSrc || !detectedItems || detectedItems.length === 0) return;

    const img = new Image();
    img.src = imageSrc;
    img.crossOrigin = "Anonymous"; // If needed for objectURLs or external images
    
    img.onload = () => {
      const newCrops = {};
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      detectedItems.forEach(item => {
        if (item.bbox && item.bbox.length === 4) {
          const [ymin, xmin, ymax, xmax] = item.bbox;
          
          // Convert normalized (0-1000) to pixels
          const left = (xmin / 1000) * img.width;
          const top = (ymin / 1000) * img.height;
          const width = ((xmax - xmin) / 1000) * img.width;
          const height = ((ymax - ymin) / 1000) * img.height;

          // Validity check
          if (width > 0 && height > 0) {
              // Set canvas size to crop size
              canvas.width = width;
              canvas.height = height;
    
              // Draw crop
              ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
              
              // Get data URL
              newCrops[item.name] = canvas.toDataURL('image/jpeg');
          }
        }
      });
      setCrops(newCrops);
    };
  }, [imageSrc, detectedItems]);

  const itemsWithBbox = detectedItems.filter(item => item.bbox);

  if (itemsWithBbox.length === 0) return null;

  return (
    <div style={{ marginTop: '2rem' }}>
      <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
        🥦 Detected Ingredients & Similar References
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {itemsWithBbox.map((item, idx) => {
            const safeName = item.name.replace(" ", "%20");
            const refUrl = `https://www.themealdb.com/images/ingredients/${safeName}.png`;
            const searchUrl = `https://www.google.com/search?tbm=isch&q=${safeName}`;
            
            return (
                <div key={idx} style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.8rem', textTransform: 'capitalize', color: 'var(--text-primary)' }}>{item.name}</div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.8rem' }}>
                        
                        {/* Crop */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                           <div style={{ 
                               width: '100%', 
                               aspectRatio: '1', 
                               background: '#000', 
                               borderRadius: '8px', 
                               overflow: 'hidden', 
                               display: 'flex', 
                               alignItems: 'center', 
                               justifyContent: 'center',
                               border: '1px solid var(--border)'
                            }}>
                                {crops[item.name] ? (
                                    <img src={crops[item.name]} alt="Crop" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{color: 'gray', fontSize: '0.8rem'}}>Processing...</span>
                                )}
                           </div>
                           <small style={{ marginTop: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Your Image</small>
                        </div>

                        {/* Reference */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ 
                               width: '100%', 
                               aspectRatio: '1', 
                               background: 'white', 
                               borderRadius: '8px', 
                               display: 'flex', 
                               alignItems: 'center', 
                               justifyContent: 'center',
                               padding: '5px',
                               border: '1px solid var(--border)'
                            }}>
                                <img 
                                    src={refUrl} 
                                    alt="Ref" 
                                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                    onError={(e) => {
                                        e.target.style.display='none';
                                        // e.target.parentElement.innerHTML = '<span style="font-size:0.7rem; color: #999">No Ref</span>';
                                    }}
                                />
                            </div>
                           <small style={{ marginTop: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Suggested Ref</small>
                        </div>
                    </div>
                    
                    <a href={searchUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', color: 'var(--primary)', textDecoration: 'none', display: 'block', textAlign: 'center', fontWeight: 500 }}>
                        🔎 View on Google Images
                    </a>
                </div>
            );
        })}
      </div>
    </div>
  );
};

export default IngredientVisualizer;
