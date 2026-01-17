
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ChatAssistant from '../components/ChatAssistant';
import Webcam from 'react-webcam';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8010';

const CookingMode = () => {
    const { recipeId } = useParams();
    const navigate = useNavigate();
    const [recipe, setRecipe] = useState(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [timer, setTimer] = useState(null); // { remaining: seconds, original: seconds }
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    
    // Translation State
    const [targetLang, setTargetLang] = useState('en');
    const [translations, setTranslations] = useState({});
    const [isTranslating, setIsTranslating] = useState(false);
    
    // Voice Recognition State
    const [isListening, setIsListening] = useState(false);
    const [lastHeard, setLastHeard] = useState("");
    const recognitionRef = useRef(null);
    
    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    
    // AI Verification State
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationFeedback, setVerificationFeedback] = useState(null);

    // Webcam State
    const webcamRef = useRef(null);
    const [showCamera, setShowCamera] = useState(false);
    const [isProcessingVisual, setIsProcessingVisual] = useState(false);

    // Refs for accessing latest state inside event listeners
    const recipeRef = useRef(recipe);
    const stepRef = useRef(currentStep);
    const isListeningRef = useRef(isListening);

    useEffect(() => {
        recipeRef.current = recipe;
        stepRef.current = currentStep;
        isListeningRef.current = isListening;
    }, [recipe, currentStep, isListening]);

    useEffect(() => {
        const loadRecipe = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/recipe/${recipeId}`);
                setRecipe(res.data);
            } catch (err) {
                console.error(err);
                alert("Failed to load recipe");
            } finally {
                setLoading(false);
            }
        };
        loadRecipe();

        // Setup Speech Recognition
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = 'en-US';

            recognitionRef.current.onresult = (event) => {
                const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
                console.log("Voice Command:", transcript);
                setLastHeard(transcript);
                processVoiceCommand(transcript);
            };

            recognitionRef.current.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                if (event.error === 'not-allowed') {
                    setIsListening(false);
                    alert("Microphone access denied.");
                }
            };
            
            recognitionRef.current.onend = () => {
                // Auto-restart if it shouldn't have stopped
                if (isListeningRef.current) {
                    try {
                        recognitionRef.current.start();
                        console.log("Restarting speech recognition...");
                    } catch (e) {
                        console.log("Cannot restart recognition:", e);
                    }
                }
            };
        } else {
             console.warn("Voice commands are not supported in this browser.");
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.onend = null; // Prevent restart on unmount
                recognitionRef.current.stop();
            }
            window.speechSynthesis.cancel();
        };
    }, [recipeId]);

    // Timer Interval
    useEffect(() => {
        let interval = null;
        if (isTimerRunning && timer && timer.remaining > 0) {
            interval = setInterval(() => {
                setTimer(prev => ({ ...prev, remaining: prev.remaining - 1 }));
            }, 1000);
        } else if (timer && timer.remaining === 0) {
            setIsTimerRunning(false);
            speakText("Timer finished!");
            alert("Timer Done!");
        }
        return () => clearInterval(interval);
    }, [isTimerRunning, timer]);

    const handleLangChange = async (lang) => {
        setTargetLang(lang);
        if (lang === 'en') return;

        // Check cache
        if (!translations[currentStep]?.[lang]) {
            setIsTranslating(true);
            try {
                const text = recipe.instructions[currentStep];
                const res = await axios.post(`${API_BASE_URL}/translate`, {
                    text: text,
                    target_lang: lang
                });
                setTranslations(prev => ({
                    ...prev,
                    [currentStep]: { ...prev[currentStep] || {}, [lang]: res.data.translated_text }
                }));
            } catch (err) {
                console.error("Translation failed", err);
            } finally {
                setIsTranslating(false);
            }
        }
    };
    
    // Auto-translate when step changes if not in English
    useEffect(() => {
        if (targetLang !== 'en' && recipe) {
             handleLangChange(targetLang);
        }
    }, [currentStep, recipe]);

    const processVoiceCommand = (cmd) => {
        const currentR = recipeRef.current;
        const currentS = stepRef.current;

        if (!currentR || !currentR.instructions) return;

        // Visual Query Command
        if (cmd.includes('look at this') || cmd.includes('check this')) {
            handleVisualQuery();
            return;
        }

        if (cmd.includes('next')) {
            if (currentS < (currentR.instructions.length - 1)) {
                setCurrentStep(prev => prev + 1);
                stopSpeaking();
            }
        }
        else if (cmd.includes('back') || cmd.includes('previous')) {
            if (currentS > 0) {
                setCurrentStep(prev => prev - 1);
                stopSpeaking();
            }
        }
        else if (cmd.includes('repeat') || cmd.includes('read')) {
             const text = currentR.instructions[currentS];
             speakText(text);
        }
        else if (cmd.includes('timer') && cmd.includes('stop')) {
            if (isTimerRunning) {
                setIsTimerRunning(false);
                setTimer(null);
                speakText("Timer stopped.");
            } else {
                speakText("No timer is running.");
            }
        }
        else if (cmd.includes('timer') && cmd.includes('start')) {
             const stepText = currentR.instructions[currentS];
             const match = stepText.match(/(\d+)\s*min/i);
             if (match) {
                 const mins = parseInt(match[1]);
                 setTimer({ remaining: mins * 60, original: mins * 60 });
                 setIsTimerRunning(true);
                 speakText(`Starting timer for ${mins} minutes.`);
             } else {
                 speakText("No time detected in this step.");
             }
        }
        else if (cmd.includes('stop')) {
            stopSpeaking();
        }
        // General Voice Chat Fallback
        else if (cmd.length > 5 && !isSpeaking) {
             // Treat as a question to the Chef
             handleVoiceQuery(cmd);
        }
    };

    const handleVisualQuery = async () => {
        if (!webcamRef.current) {
            speakText("I need to see you first. Please enable the camera.");
            setShowCamera(true); // Auto-open camera if closed
            return;
        }

        speakText("Taking a look...");
        setIsProcessingVisual(true);

        try {
            const imageSrc = webcamRef.current.getScreenshot();
            if (!imageSrc) {
                throw new Error("Failed to capture image");
            }

            // Convert base64 to blob
            const res = await fetch(imageSrc);
            const blob = await res.blob();
            const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });

            const formData = new FormData();
            formData.append('text_input', "Strictly analyze this image. Does the food look like it matches the current step? If it looks wrong, tell me how to fix it. If it looks good, say 'Great job!'");
            formData.append('file', file);
            
            const context = {
                recipe_name: recipeRef.current ? recipeRef.current.name : "Unknown",
                step_label: `Step ${stepRef.current + 1}`,
                instruction: recipeRef.current.instructions[stepRef.current]
            };
            formData.append('context', JSON.stringify(context));

            const apiRes = await axios.post(`${API_BASE_URL}/chat`, formData, {
                 headers: { 'Content-Type': 'multipart/form-data' }
            });

            const reply = apiRes.data.response;
            speakText(reply);

        } catch (err) {
            console.error("Visual query failed", err);
            speakText("Sorry, I couldn't see that clearly. Please try again.");
        } finally {
            setIsProcessingVisual(false);
        }
    };

    const handleVoiceQuery = async (query) => {
        // Simple feedback
        speakText("One moment...");
        
        try {
            const formData = new FormData();
            formData.append('text_input', query);
            
            const context = {
                recipe_name: recipeRef.current ? recipeRef.current.name : "Unknown",
                step_label: `Step ${stepRef.current + 1}`,
                instructions: recipeRef.current.instructions ? recipeRef.current.instructions[stepRef.current] : ""
            };
            formData.append('context', JSON.stringify(context));

            const apiRes = await axios.post(`${API_BASE_URL}/chat`, formData);
            const reply = apiRes.data.response;
            speakText(reply);
            
        } catch (err) {
            console.error("Voice chat failed", err);
            speakText("Sorry, I didn't catch that.");
        }
    };

    const toggleListening = () => {
        if (!recognitionRef.current) return;
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            recognitionRef.current.start();
            setIsListening(true);
        }
    };

    const speakText = (text) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (targetLang !== 'en') {
             // Try to find voice for target language? For now default (en) is safer or specific locale
             // utterance.lang = targetLang; 
        }
        utterance.onend = () => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
    };

    const stopSpeaking = () => {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    };

    const readStep = () => {
        if (!recipe || !recipe.instructions) return;
        const text = displayText; // Speak the translated text if available? Or always English?
        // Let's speak the visible text logic
        
        // Actually, WebSpeech API language support varies. 
        // Ideally we speak the english text if lang is english, or try to speak the translation.
        speakText(text);
    };

    const handleNext = () => {
        if (currentStep < (recipe.instructions.length - 1)) {
            setCurrentStep(prev => prev + 1);
            stopSpeaking();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
            stopSpeaking();
        }
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };


    if (loading) return <div className="loading">Loading Recipe...</div>;
    if (!recipe) return <div className="error">Recipe not found.</div>;

    const instructions = recipe.instructions || [];
    const stepText = instructions.length > 0 ? instructions[currentStep] : "No instructions available.";
    
    // Logic to show "Timer" tip if regex matches
    const timerMatch = stepText ? stepText.match(/(\d+)\s*min/i) : null;
    const hasTimer = !!timerMatch;
    
    const displayText = (targetLang !== 'en' && translations[currentStep]?.[targetLang]) 
                        ? translations[currentStep][targetLang] 
                        : stepText;

    const progress = Math.round(((currentStep + 1) / instructions.length) * 100);

    return (
        <div className="cooking-mode-container">
            {/* 1. Header */}
            <header className="cooking-header">
                <button onClick={() => navigate('/')} className="control-btn btn-secondary">
                    ← Exit
                </button>
                <div style={{display:'flex', gap:'1rem', alignItems:'center'}}>
                    <h3 className="recipe-title">{recipe.name}</h3>
                    
                    {/* Language Selector Inline */}
                    <select 
                        value={targetLang} 
                        onChange={(e) => handleLangChange(e.target.value)} 
                        disabled={isTranslating}
                        style={{padding:'0.5rem', borderRadius:'0.5rem', border:'1px solid #ccc'}}
                    >
                        <option value="en">English</option>
                        <option value="hi">Hindi</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                    </select>
                </div>
                
                <div style={{display:'flex', gap:'0.5rem'}}>
                    <button 
                        className={`control-btn ${isChatOpen ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setIsChatOpen(!isChatOpen)}
                        title="Chat with AI Chef"
                    >
                        👨‍🍳 Chat
                    </button>
                    <button 
                        className={`control-btn ${isListening ? 'mic-active' : 'btn-secondary'}`} 
                        onClick={toggleListening}
                        title="Say: 'Next', 'Back', 'Look at this'"
                        style={{ minWidth: '120px' }}
                    >
                        {isListening ? '🛑 Stop Mic' : '🎙️ Start Mic'}
                    </button>

                    <button 
                        className={`control-btn ${showCamera ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setShowCamera(!showCamera)}
                        title="Toggle Camera"
                    >
                        {showCamera ? '📷 On' : '📷 Off'}
                    </button>
                </div>
            </header>

            {/* 2. Main Content Area */}
            <div className="cooking-content">
                <div className="step-card">
                    {/* Left: Visual Placeholder */}
                    <div className="step-visual">
                        {/* Could be an icon or image based on keyword analysis later */}
                        <span>🥣</span>
                    </div>

                    {/* Right: Content */}
                    <div className="step-details">
                        <div className="step-header">
                            <span className="step-number">Step {currentStep + 1}</span>
                            {/* Contextual Timer Hint */}
                            {hasTimer && (
                                <div className="step-timer">
                                    <span>⏱ {timerMatch[0]}</span>
                                </div>
                            )}
                        </div>

                        <div className="instruction-text">
                            {isTranslating ? 
                                <span style={{color:'#94a3b8'}}>Translating step...</span> : 
                                displayText
                            }
                        </div>


                        {/* Contextual Tips Footer inside card */}
                        <div className="step-tips">
                            {hasTimer ? "Tip: Say 'Start Timer' to begin counting down." : "Tip: Keep specific utensils ready."}
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Footer Controls */}
            <footer className="cooking-footer">
                <div className="controls-grid">
                    {/* Progress Bar Row */}
                    <div className="progress-section">
                        <div className="progress-labels">
                            <span>Step {currentStep + 1}</span>
                            <span>{instructions.length} Total</span>
                        </div>
                        <div className="progress-trough">
                            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>

                    {/* Control Buttons Row */}
                    <div style={{justifySelf:'end'}}>
                         <button 
                            className="control-btn btn-secondary" 
                            onClick={handlePrev}
                            disabled={currentStep === 0}
                        >
                            Previous
                        </button>
                    </div>

                    <div style={{display:'flex', gap:'1rem'}}>
                         <button 
                            className="control-btn btn-primary btn-icon" 
                            onClick={isSpeaking ? stopSpeaking : readStep}
                            title="Read Aloud"
                        >
                            {isSpeaking ? '🔇' : '🔊'}
                        </button>
                        
                        {/* Timer Control if Running */}
                        {isTimerRunning && (
                            <div className="control-btn" style={{background:'#fef3c7', color:'#d97706'}}>
                                ⏳ {formatTime(timer.remaining)}
                            </div>
                        )}
                    </div>

                    <div style={{justifySelf:'start'}}>
                        <button 
                            className="control-btn btn-primary" 
                            onClick={handleNext}
                            disabled={currentStep === instructions.length - 1}
                        >
                            Next Step →
                        </button>
                    </div>
                </div>
                
                {/* Voice Debug Overlay (Small) */}
                {isListening && lastHeard && (
                    <div style={{textAlign:'center', marginTop:'1rem', fontSize:'0.8rem', color:'#94a3b8'}}>
                        Heard: "{lastHeard}"
                    </div>
                )}
            </footer>
            
            {/* Chat Sidebar Overlay */}
            {isChatOpen && (
                <div style={{
                    position: 'fixed', top: '70px', right: '1rem', bottom: '1rem', width: '350px',
                    zIndex: 1000, borderRadius: '0.8rem', overflow: 'hidden'
                }}>
                    <ChatAssistant 
                        recipe={recipe} 
                        currentStep={currentStep} 
                        stepText={displayText} 
                    />
                </div>
            )}

            {/* Webcam Overlay */}
            {showCamera && (
                <div style={{
                    position: 'fixed', bottom: '80px', left: '1rem', 
                    width: '200px', height: '150px', background: 'black',
                    borderRadius: '0.8rem', overflow: 'hidden', border: '2px solid white',
                    zIndex: 900, boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                }}>
                    <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        videoConstraints={{ facingMode: "user" }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div style={{
                        position: 'absolute', bottom: '0.5rem', left: '0', right: '0', 
                        display: 'flex', justifyContent: 'center'
                    }}>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleVisualQuery(); }}
                            disabled={isProcessingVisual}
                            style={{
                                padding: '0.3rem 0.8rem', background: '#3b82f6', color: 'white', 
                                border: 'none', borderRadius: '1rem', fontSize: '0.8rem', cursor: 'pointer',
                                opacity: 0.9, fontWeight: 'bold'
                            }}
                        >
                            {isProcessingVisual ? 'Thinking...' : '👀 Analyze'}
                        </button>
                    </div>
                    {isProcessingVisual && (
                         <div style={{
                             position:'absolute', top:0, left:0, right:0, bottom:0, 
                             background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center',
                             color:'white', fontWeight:'bold'
                         }}>
                             Thinking...
                         </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CookingMode;
