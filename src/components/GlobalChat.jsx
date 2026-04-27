import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { callAI, formatTime } from '../utils/store';

const MODELS = [
  { id: 'moonshotai/kimi-k2.5', label: 'Kimi (moonshotai/kimi-k2.5)' },
  { id: 'z-ai/glm-5.1', label: 'GLM 5.1 (z-ai/glm-5.1)' },
  { id: 'meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' }
];

const GLOBAL_PROMPT = `You are a highly capable AI assistant inside NEXUS AI. 
Provide highly accurate, thoughtful, and human-like responses. 
CRITICAL RULE: Always reply in the exact same language the user uses. 
If they speak in Indonesian, reply in natural, fluent Indonesian.
Provide concise responses unless specifically asked for detail.`;

export default function GlobalChat({ apiKey, onNeedApiKey }) {
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [streamingText, setStreamingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const handleSend = async () => {
    if (!apiKey) {
      onNeedApiKey();
      return;
    }
    if (!inputMsg.trim()) return;

    const userText = inputMsg;
    setInputMsg('');
    setError(null);
    setIsLoading(true);
    setStreamingText('');

    const newMsg = { role: 'user', content: userText, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, newMsg]);

    abortRef.current = new AbortController();

    try {
      const context = messages.map(m => ({ role: m.role, content: m.content })).slice(-20);
      
      const fullText = await callAI(
        apiKey,
        selectedModel,
        GLOBAL_PROMPT,
        context,
        userText,
        (partial) => {
          setStreamingText(partial);
        },
        abortRef.current.signal
      );

      setMessages(prev => [...prev, { role: 'assistant', content: fullText, timestamp: new Date().toISOString() }]);
      setStreamingText('');
    } catch (err) {
      if (err.name === 'AbortError') {
        if (streamingText) {
          setMessages(prev => [...prev, { role: 'assistant', content: streamingText, timestamp: new Date().toISOString() }]);
        }
        setStreamingText('');
      } else {
        setError(err.message || 'Error communicating with AI');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="global-chat-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
      <div className="global-chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '10px 20px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>🌍 Global AI Chat</h2>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Freeform conversational AI</span>
        </div>
        <select 
          value={selectedModel} 
          onChange={e => setSelectedModel(e.target.value)}
          style={{ background: 'var(--bg-deep)', color: 'var(--text-primary)', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', outline: 'none' }}
        >
          {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      <div className="chat-messages" ref={scrollRef} style={{ flex: 1, overflowY: 'auto', paddingRight: '10px', display: 'flex', flexDirection: 'column' }}>
        {messages.length === 0 && !streamingText && (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3 style={{ marginBottom: 10 }}>How can I help you today?</h3>
            <p style={{ maxWidth: 400 }}>Ask me anything. I\'ll respond thoughtfully in your language.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-agent'} style={{ animationDelay: '0ms' }}>
            <div className={msg.role === 'user' ? 'chat-msg-user-bubble' : 'chat-msg-agent-bubble'} style={{ maxWidth: '100%' }}>
              <div className="prose chat-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            </div>
            <div className={msg.role === 'user' ? 'chat-msg-user-badge' : 'chat-msg-agent-badge'} style={msg.role === 'assistant' ? { background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'var(--border)' } : {}}>
              {msg.role === 'user' ? 'You' : 'AI'} {msg.timestamp && <span style={{ opacity: 0.5, marginLeft: 8 }}>{formatTime(msg.timestamp)}</span>}
            </div>
          </div>
        ))}

        {streamingText && (
          <div className="chat-msg-agent streaming-msg" style={{ animationDelay: '0ms' }}>
             <div className="chat-msg-agent-bubble" style={{ maxWidth: '100%' }}>
               <div className="prose chat-prose">
                 <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
               </div>
               <div className="streaming-progress-bar"><div className="streaming-progress-fill" style={{background: 'white'}}></div></div>
             </div>
             <div className="chat-msg-agent-badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'var(--border)' }}>AI <span className="streaming-dot-group"><span className="streaming-dot" style={{background:'white'}}></span><span className="streaming-dot" style={{background:'white'}}></span><span className="streaming-dot" style={{background:'white'}}></span></span></div>
          </div>
        )}

        {isLoading && !streamingText && (
          <div className="chat-msg-agent">
             <div className="thinking-bubble" style={{ maxWidth: 200 }}>
               <div className="thinking-dots">
                 <div className="thinking-dot" style={{background:'white'}}></div>
                 <div className="thinking-dot" style={{background:'white'}}></div>
                 <div className="thinking-dot" style={{background:'white'}}></div>
               </div>
               <span className="thinking-label">Thinking...</span>
             </div>
          </div>
        )}

        {error && (
          <div className="error-notice" style={{ marginTop: 16 }}>
            <span className="error-notice-icon">⚠</span> <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      <div className="prompt-area" style={{ marginTop: '20px', padding: '10px', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border)' }}>
        <div className="prompt-row" style={{ display: 'flex', gap: '10px' }}>
          <div className="prompt-input-wrap" style={{ flex: 1, position: 'relative' }}>
            <textarea
              className="prompt-textarea"
              placeholder="Message AI... (Ctrl+Enter to send)"
              value={inputMsg}
              onChange={(e) => {
                setInputMsg(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
              style={{ paddingRight: '40px' }}
            />
            <span className="prompt-hint">⌘↵</span>
          </div>
          {isLoading ? (
            <button className="send-btn send-btn-stop" onClick={handleStop} title="Stop generation">
              <span className="stop-icon">⬛</span>
            </button>
          ) : (
            <button className="send-btn" onClick={handleSend} disabled={!inputMsg.trim()} title="Send (Ctrl+Enter)">
               <span className="send-arrow">➤</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
