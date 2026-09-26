import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAgriAI } from '../../context/AgriAIContext';
import SuggestedQuestions from './SuggestedQuestions';
import { useTranslation } from 'react-i18next';
import './AgricultureAIChat.css';

const speechLanguages = {
    en: "en-IN",
    te: "te-IN",
    hi: "hi-IN",
    ta: "ta-IN",
    kn: "kn-IN",
    ml: "ml-IN",
    bn: "bn-IN"
};

const AgricultureAIChat = () => {
    const { isChatOpen, toggleChat, chatHistory, setChatHistory, contextData, clearChat } = useAgriAI();
    const { t, i18n } = useTranslation();
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isCooldown, setIsCooldown] = useState(false);
    const messagesEndRef = useRef(null);

    // Voice Input State
    const [isListening, setIsListening] = useState(false);
    const [voiceSupported, setVoiceSupported] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState("");
    const [voiceError, setVoiceError] = useState("");
    const [speakingMessageId, setSpeakingMessageId] = useState(null);
    const recognitionRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatHistory, isLoading, interimTranscript, voiceError]);

    // Initialize Speech Recognition
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            setVoiceSupported(true);
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;

            recognition.onresult = (event) => {
                let final = "";
                let interim = "";
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        final += transcript;
                    } else {
                        interim += transcript;
                    }
                }
                if (interim) setInterimTranscript(interim);
                if (final) {
                    setInputValue((prev) => prev ? `${prev} ${final}`.trim() : final.trim());
                    setInterimTranscript("");
                }
            };

            recognition.onerror = (event) => {
                let msg = t("aiChat.errorNoHear");
                if (event.error === 'not-allowed') msg = t("aiChat.errorMicAccess");
                if (event.error === 'network') msg = t("aiChat.errorNetwork");
                setVoiceError(msg);
                setIsListening(false);
                setInterimTranscript("");
                setTimeout(() => setVoiceError(""), 5000);
            };

            recognition.onend = () => {
                setIsListening(false);
                setInterimTranscript("");
            };

            recognitionRef.current = recognition;
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    const startVoiceRecognition = () => {
        if (!recognitionRef.current) return;
        
        // Stop any ongoing speech response when microphone is activated
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            setSpeakingMessageId(null);
        }
        
        setVoiceError("");
        const langCode = speechLanguages[i18n.language] || "en-IN";
        recognitionRef.current.lang = langCode;
        setIsListening(true);
        try {
            recognitionRef.current.start();
        } catch (e) {
            console.error(e);
        }
    };

    const stopVoiceRecognition = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        setIsListening(false);
        setInterimTranscript("");
    };

    const handleVoiceToggle = () => {
        if (isListening) stopVoiceRecognition();
        else startVoiceRecognition();
    };

    const handleSpeakResponse = (text, idx) => {
        if (!('speechSynthesis' in window)) return;

        if (speakingMessageId === idx && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            setSpeakingMessageId(null);
            return;
        }

        window.speechSynthesis.cancel(); // Stop any ongoing speech
        const utterance = new SpeechSynthesisUtterance(text);
        const langCode = speechLanguages[i18n.language] || "en-IN";
        utterance.lang = langCode;

        utterance.onstart = () => setSpeakingMessageId(idx);
        utterance.onend = () => setSpeakingMessageId(null);
        utterance.onerror = () => setSpeakingMessageId(null);

        window.speechSynthesis.speak(utterance);
    };

    useEffect(() => {
        if (isChatOpen && chatHistory.length === 0) {
            setChatHistory([{
                role: 'model',
                content: t("aiChat.welcomeMessage"),
                isWelcome: true
            }]);
        }
    }, [isChatOpen, chatHistory, setChatHistory, t]);

    // Track handled context to prevent infinite loops from re-renders
    const handledContextRef = useRef(null);

    // Handle context injected from other modules
    useEffect(() => {
        if (contextData && isChatOpen) {
            // Check if we already handled this exact context
            const contextString = JSON.stringify(contextData);
            if (handledContextRef.current === contextString) return;
            handledContextRef.current = contextString;

            let contextMessage = "I have context from the application:\n";
            if (contextData.module === 'disease_detection') {
                contextMessage += `Disease Detected: **${contextData.disease}** in ${contextData.crop} (${contextData.confidence}% confidence).`;
            } else if (contextData.module === 'crop_recommendation') {
                contextMessage += `Recommended Crop: **${contextData.recommended_crop}** (${contextData.confidence}% confidence).`;
            } else if (contextData.module === 'yield_prediction') {
                contextMessage += `Predicted Yield: **${contextData.predicted_yield_tonnes_per_ha}** tonnes/ha for ${contextData.crop}.`;
            } else if (contextData.module === 'disease_risk') {
                contextMessage += `Disease Risk Level: **${contextData.riskLevel}**.`;
            } else if (contextData.module === 'crop_lifecycle') {
                contextMessage += `Viewing Crop: **${contextData.crop}**.`;
            }
            
            setChatHistory(prevHistory => {
                const lastMsg = prevHistory[prevHistory.length - 1];
                if (lastMsg && lastMsg.isContextInfo && lastMsg.content === contextMessage) {
                    return prevHistory;
                }
                
                const newHistory = [...prevHistory, { role: 'user', content: contextMessage, isContextInfo: true }];
                
                const queryMap = {
                    'disease_detection': "Can you explain the symptoms, causes, and how to control this disease?",
                    'crop_recommendation': "Why is this crop recommended and what are the general cultivation requirements?",
                    'yield_prediction': "What factors affect this yield and how can I improve it?",
                    'disease_risk': "How can I mitigate this disease risk?",
                    'crop_lifecycle': "Tell me about the life cycle stages for this crop."
                };
                
                const autoQuery = queryMap[contextData.module] || "Can you give me more information about this?";
                
                // Use a timeout to ensure state settles before sending
                setTimeout(() => {
                    handleSendMessage(autoQuery, newHistory);
                }, 100);
                
                return newHistory;
            });
        }
    }, [contextData, isChatOpen]); 

    const handleSendMessage = async (text = inputValue, currentHistory = chatHistory) => {
        if (!text.trim() || isLoading || isCooldown) return;

        const userMessage = { role: 'user', content: text };
        const newHistory = [...currentHistory, userMessage];
        setChatHistory(newHistory);
        setInputValue("");
        setInterimTranscript("");
        setIsLoading(true);

        try {
            const response = await fetch('http://localhost:5000/api/agriculture-ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: currentHistory.filter(msg => !msg.isContextInfo && !msg.isWelcome),
                    context: contextData
                })
            });

            const data = await response.json();

            if (data.success) {
                setChatHistory([...newHistory, { role: 'model', content: data.reply }]);
            } else {
                let errorMsg = data.message || "An error occurred.";
                if (data.errorCategory) {
                    errorMsg = t(`aiChat.${data.errorCategory}`, { defaultValue: errorMsg });
                }
                setChatHistory([...newHistory, { role: 'model', content: errorMsg, isError: true }]);
            }
        } catch (error) {
            setChatHistory([...newHistory, { 
                role: 'model', 
                content: t("aiChat.network_error", { defaultValue: t("aiChat.connectionError") }), 
                isError: true 
            }]);
        } finally {
            setIsLoading(false);
            setIsCooldown(true);
            setTimeout(() => {
                setIsCooldown(false);
            }, 3000);
        }
    };

    if (!isChatOpen) {
        return (
            <div className="agri-ai-chat-wrapper">
                <button className="agri-ai-floating-btn" onClick={toggleChat}>
                    <span role="img" aria-label="sprout">🌱</span> AgriAI
                </button>
            </div>
        );
    }

    const languageDisplayNames = {
        en: "English", te: "Telugu", hi: "Hindi", ta: "Tamil", kn: "Kannada"
    };

    return (
        <div className="agri-ai-chat-wrapper">
            <div className="agri-ai-chat-panel">
                <div className="agri-ai-header">
                    <div className="agri-ai-title-wrapper">
                        <h3 className="agri-ai-title">{t("aiChat.title")}</h3>
                        <p className="agri-ai-subtitle">{t("aiChat.subtitle")}</p>
                    </div>
                    <div className="header-actions">
                        <button className="agri-ai-clear-btn" onClick={clearChat} title={t("aiChat.clearChat")}>🧹</button>
                        <button className="agri-ai-close-btn" onClick={toggleChat} title={t("common.close")}>✕</button>
                    </div>
                </div>

                <div className="agri-ai-messages">
                    {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`agri-ai-message ${msg.role} ${msg.isError ? 'error' : ''}`}>
                            <div className="message-content-wrapper">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                {msg.role === 'model' && !msg.isWelcome && !msg.isError && (
                                    <button 
                                        className="tts-listen-btn" 
                                        onClick={() => handleSpeakResponse(msg.content, idx)}
                                        title={speakingMessageId === idx ? t("aiChat.stopSpeaking") : t("aiChat.listenToResponse")}
                                        aria-label={speakingMessageId === idx ? t("aiChat.stopSpeaking") : t("aiChat.listenToResponse")}
                                    >
                                        {speakingMessageId === idx ? t("aiChat.stopBtn") : t("aiChat.listenBtn")}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    
                    {chatHistory.length === 1 && chatHistory[0].role === 'model' && (
                        <SuggestedQuestions onSelect={(q) => handleSendMessage(q)} />
                    )}

                    {isLoading && (
                        <div className="typing-indicator">
                            <div className="typing-dot"></div>
                            <div className="typing-dot"></div>
                            <div className="typing-dot"></div>
                            <span style={{marginLeft: '8px', fontSize: '12px', color: '#666'}}>{t("aiChat.thinking")}</span>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="agri-ai-input-container">
                    {voiceError && <div className="voice-error-msg">{voiceError}</div>}
                    {isListening && (
                        <div className="voice-listening-indicator">
                            🎙️ {t("aiChat.listeningIn")} {languageDisplayNames[i18n.language] || "English"}...
                        </div>
                    )}
                    
                    <div className="agri-ai-input-area">
                        <input 
                            type="text" 
                            className="agri-ai-input" 
                            placeholder={t("aiChat.placeholder")} 
                            value={inputValue + (interimTranscript ? ` ${interimTranscript}` : "")}
                            onChange={(e) => {
                                setInputValue(e.target.value);
                                setInterimTranscript("");
                            }}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            disabled={isLoading || isCooldown}
                        />
                        
                        {voiceSupported && (
                            <button 
                                className={`voice-input-btn ${isListening ? 'listening' : ''}`}
                                onClick={handleVoiceToggle}
                                disabled={isLoading || isCooldown}
                                title={isListening ? t("aiChat.stopListening") : t("aiChat.speakBtn")}
                                aria-label={isListening ? t("aiChat.stopListening") : t("aiChat.speakBtn")}
                            >
                                {isListening ? "🔴" : "🎤"}
                            </button>
                        )}

                        <button 
                            className="agri-ai-send-btn" 
                            onClick={() => handleSendMessage()}
                            disabled={isLoading || isCooldown || (!inputValue.trim() && !interimTranscript.trim())}
                        >
                            ➤
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgricultureAIChat;
