import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FaPaperPlane, FaImage, FaTimes, FaRobot, FaUser } from 'react-icons/fa'; // Assuming react-icons is installed or use text

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8010';

const ChatAssistant = ({ recipe, currentStep, stepText }) => {
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState("");
    const [selectedImage, setSelectedImage] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Initial Welcome Message
    useEffect(() => {
        if (recipe && messages.length === 0) {
            let welcomeText = `Namaste! I see you've chosen to cook **${recipe.name}**!`;
            
            if (recipe.missing_ingredients && recipe.missing_ingredients.length > 0) {
                welcomeText += `\nI noticed you might be missing ${recipe.missing_ingredients.length} ingredients. Let me know if you need substitutes ji!`;
            } else {
                welcomeText += `\nIt looks like a perfect match! Let's get started.`;
            }
            
            setMessages([{ role: 'assistant', content: welcomeText }]);
        }
    }, [recipe]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!inputText.trim() && !selectedImage) return;

        const userMsg = { role: 'user', content: inputText, image: selectedImage ? URL.createObjectURL(selectedImage) : null };
        setMessages(prev => [...prev, userMsg]);
        
        setIsLoading(true);
        const currentInput = inputText;
        const currentImage = selectedImage;
        
        setInputText("");
        setSelectedImage(null);

        const formData = new FormData();
        formData.append('text_input', currentInput || (currentImage ? "Check this image" : "")); // OpenRouter usually needs some text
        if (currentImage) {
            formData.append('file', currentImage);
        }
        
        const context = {
            recipe_name: recipe ? recipe.name : "Unknown",
            step_label: `Step ${currentStep + 1}`,
            instruction: stepText
        };
        formData.append('context', JSON.stringify(context));
        formData.append('history', JSON.stringify(messages)); // Optional

        try {
            const res = await axios.post(`${API_BASE_URL}/chat`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            const botMsg = { role: 'assistant', content: res.data.response };
            setMessages(prev => [...prev, botMsg]);
        } catch (err) {
            console.error(err);
            const errorMsg = err.response?.data?.detail || "Sorry ji, something went wrong. Please try again.";
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errorMsg}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="chat-assistant-container" style={{
            display: 'flex', flexDirection: 'column', height: '100%', 
            background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-2px 0 5px rgba(0,0,0,0.05)'
        }}>
            {/* Header */}
            <div style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>👨‍🍳</span>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#334155' }}>AI Chef Assistant</h3>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={{ 
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        background: msg.role === 'user' ? '#3b82f6' : '#f1f5f9',
                        color: msg.role === 'user' ? 'white' : '#1e293b',
                        padding: '0.8rem',
                        borderRadius: '0.8rem',
                        borderBottomRightRadius: msg.role === 'user' ? 0 : '0.8rem',
                        borderBottomLeftRadius: msg.role === 'assistant' ? 0 : '0.8rem'
                    }}>
                        {msg.image && (
                            <img src={msg.image} alt="User upload" style={{ maxWidth: '100%', borderRadius: '0.5rem', marginBottom: '0.5rem' }} />
                        )}
                        <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    </div>
                ))}
                {isLoading && (
                    <div style={{ alignSelf: 'flex-start', background: '#f1f5f9', padding: '0.8rem', borderRadius: '0.8rem', color: '#64748b' }}>
                        Type...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '1rem', borderTop: '1px solid #f1f5f9', background: 'white' }}>
                {selectedImage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', padding: '0.5rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Image attached</span>
                        <button onClick={() => setSelectedImage(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}>✕</button>
                    </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                    <label style={{ cursor: 'pointer', padding: '0.6rem', color: '#64748b', transition: 'color 0.2s' }} title="Upload Image">
                        📷
                        <input 
                            type="file" 
                            accept="image/*" 
                            style={{ display: 'none' }}
                            onChange={(e) => setSelectedImage(e.target.files[0])}
                        />
                    </label>
                    <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Ask details or upload photo..."
                        style={{ 
                            flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', 
                            resize: 'none', height: '40px', maxHeight: '100px', fontFamily: 'inherit'
                        }}
                    />
                    <button 
                        onClick={handleSend}
                        disabled={isLoading || (!inputText.trim() && !selectedImage)}
                        style={{ 
                            padding: '0.6rem 1rem', background: '#3b82f6', color: 'white', border: 'none', 
                            borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold'
                        }}
                    >
                        ➤
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatAssistant;
