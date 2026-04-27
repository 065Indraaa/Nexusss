import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ROLES, callAI, addMessage, buildContextMessages,
  getProject, clearRoleMessages, parseFilesFromContent, updateProjectFiles
} from '../utils/store';

const MAX_RETRIES = 3;

// ── Realtime file parser during streaming ──────────────────
function parseCompletedBlocksFromStream(text, alreadyParsedPaths) {
  const regex = /```(.*?)\n([\s\S]*?)```/g;
  const newFiles = [];
  const seenInThisCall = new Set(alreadyParsedPaths);
  let match;

  while ((match = regex.exec(text)) !== null) {
    const lang = (match[1] || 'text').toLowerCase();
    const rawCode = match[2];
    const lines = rawCode.split('\n');
    let filenameMatch = null;
    let filename = '';
    let isContinuation = false;
    let codeStartIndex = 0;

    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i].trim();
        const m = line.match(/^(?:\/\/|#|\/\*|<!--|--)\s*file(?:name)?:\s*(.+?)(?:\s*\(continuation\))?\s*(?:\*\/|-->)?\s*$/i);
        if (m) {
            filenameMatch = m;
            isContinuation = line.toLowerCase().includes('(continuation)');
            filename = m[1].trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
            codeStartIndex = i + 1;
            break;
        }
    }

    if (!filenameMatch) continue;
    if (seenInThisCall.has(filename)) continue;
    seenInThisCall.add(filename);

    const code = lines.slice(codeStartIndex).join('\n').trimStart();
    if (!code.trim()) continue;

    newFiles.push({ path: filename, content: code, lang, role: null, isContinuation });
  }

  return newFiles;
}

// ── Theme Confirm Panel ────────────────────────────────────
function ThemeConfirmPanel({ onConfirmTheme }) {
  const [customTheme, setCustomTheme] = useState('');
  const themes = [
    'Dark Cyberpunk', 'Clean Minimal', 'Glassmorphism', 
    'Neon Retro', 'Brutalist Bold', 'Corporate Clean', 'Colorful Vibrant'
  ];

  return (
    <div className="theme-confirm-panel">
      <div className="theme-confirm-header">
        <h3>🎨 Ready to Build?</h3>
        <p>Concept complete. Choose a design theme before the Builder starts generating code:</p>
      </div>
      <div className="theme-buttons">
        {themes.map(t => (
          <button key={t} className="btn btn-outline btn-sm" onClick={() => onConfirmTheme(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="theme-custom-input">
        <input 
          type="text" 
          className="input" 
          placeholder="Or type a custom theme..." 
          value={customTheme}
          onChange={e => setCustomTheme(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && customTheme && onConfirmTheme(customTheme)}
        />
        <button 
          className="btn btn-primary" 
          disabled={!customTheme.trim()} 
          onClick={() => onConfirmTheme(customTheme)}
        >
          Build
        </button>
      </div>
    </div>
  );
}

// ── Incomplete Banner ──────────────────────────────────────
function IncompleteBanner({ onContinue }) {
  return (
    <div className="incomplete-banner">
      <span className="incomplete-icon">⚠️</span>
      <div className="incomplete-text">
        <strong>Files Incomplete</strong>
        <p>The builder stopped before finishing all files.</p>
      </div>
      <button className="btn btn-primary btn-sm" onClick={onContinue}>
        ▶ Continue Generation
      </button>
    </div>
  );
}

// ── Main ChatPanel ─────────────────────────────────────────
export default function ChatPanel({
  project, activeRole, onRoleChange, apiKey,
  onMessageSent, onNeedApiKey, onFilesGenerated
}) {
  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState({ concept: '', builder: '' });
  const [isLoading, setIsLoading] = useState({ concept: false, builder: false });
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [pendingUserMsg, setPendingUserMsg] = useState(null);
  const streamParsedPaths = useRef({ concept: new Set(), builder: new Set() });
  const scrollRef = useRef(null);
  const abortRefs = useRef({ concept: null, builder: null });

  useEffect(() => {
    return () => {
      if (abortRefs.current.concept) abortRefs.current.concept.abort();
      if (abortRefs.current.builder) abortRefs.current.builder.abort();
    };
  }, [project.id]);

  useEffect(() => {
    const fresh = getProject(project.id);
    setMessages(fresh?.roles?.[activeRole]?.messages || []);
    setError(null);
    setRetryCount(0);
  }, [project.id, activeRole]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText.concept, streamingText.builder]);

  const sendMessage = useCallback(async (userText, targetRole = activeRole, isRetry = false, retryNum = 0) => {
    if (!apiKey) { onNeedApiKey(); return; }
    if (!userText.trim()) return;

    setError(null);
    setIsLoading(prev => ({ ...prev, [targetRole]: true }));
    setStreamingText(prev => ({ ...prev, [targetRole]: '' }));
    streamParsedPaths.current[targetRole] = new Set();

    if (!isRetry) {
      setPendingUserMsg(userText);
      addMessage(project.id, targetRole, { role: 'user', content: userText });
      const fresh = getProject(project.id);
      if (activeRole === targetRole) {
        setMessages(fresh?.roles?.[targetRole]?.messages || []);
      }
    }

    const fresh = getProject(project.id);
    const contextMessages = buildContextMessages(fresh, targetRole);
    const trimmedContext = contextMessages.slice(0, -1);

    abortRefs.current[targetRole] = new AbortController();

    try {
      let prompt = userText;
      if (isRetry && retryNum > 0) {
        prompt = `[Retry ${retryNum}/${MAX_RETRIES}] Please regenerate your previous response.\n\nOriginal request: ${userText}`;
      }

      const isResume = /(?:lanjutkan|continue|lanjut|next|teruskan)/i.test(userText.trim()) && userText.trim().length < 30;
      if (isResume) {
        const lastAssistantMsg = [...(fresh?.roles?.[targetRole]?.messages || [])].reverse().find(m => m.role === 'assistant');
        if (lastAssistantMsg) {
          const fullContent = lastAssistantMsg.content.trim();
          const allLines = fullContent.split('\n');
          const lastLines = allLines.slice(-20).join('\n');
          const totalLineCount = allLines.length;
          
          const filenameMatches = [...fullContent.matchAll(/\/\/\s*filename:\s*(.+?)(?:\s*\(continuation\))?\s*$/gmi)];
          const lastFilename = filenameMatches.length > 0 ? filenameMatches[filenameMatches.length - 1][1].trim() : null;

          prompt = `[CRITICAL — CONTINUE / LANJUTKAN INSTRUCTION]
You got cut off. DO NOT restart any file. Pick up from EXACT character where you left off.
Start NEW block with exactly: // filename: ${lastFilename || 'path/to/file'} (continuation)

Your previous response ended with:
------
${lastLines}
------
Continue IMMEDIATELY from that exact point. Just the next line of code.`;
        }
      }

      const roleConfig = ROLES[targetRole];
      const fullText = await callAI(
        apiKey, roleConfig.model, roleConfig.systemPrompt, trimmedContext, prompt,
        (partial) => {
          setStreamingText(prev => ({ ...prev, [targetRole]: partial }));
          const newFiles = parseCompletedBlocksFromStream(partial, streamParsedPaths.current[targetRole]);
          if (newFiles.length > 0) {
            newFiles.forEach(f => streamParsedPaths.current[targetRole].add(f.path));
            const tagged = newFiles.map(f => ({ ...f, role: targetRole }));
            updateProjectFiles(project.id, tagged);
            if (onFilesGenerated) onFilesGenerated(tagged);
          }
        },
        abortRefs.current[targetRole].signal
      );

      const allFiles = parseFilesFromContent(fullText, targetRole);
      const unpushed = allFiles.filter(f => !streamParsedPaths.current[targetRole].has(f.path));
      const alreadyPushed = allFiles.filter(f => streamParsedPaths.current[targetRole].has(f.path));

      if (unpushed.length > 0) {
        updateProjectFiles(project.id, unpushed);
        if (onFilesGenerated) onFilesGenerated(unpushed);
      }

      if (alreadyPushed.length > 0) {
        const fresh2 = getProject(project.id);
        const currentFiles = fresh2?.generatedFiles || [];
        const toUpdate = alreadyPushed.filter(f => {
          const existing = currentFiles.find(cf => cf.path === f.path);
          return !existing || f.content.length > (existing.content?.length || 0);
        });
        if (toUpdate.length > 0) {
          updateProjectFiles(project.id, toUpdate);
          if (onFilesGenerated) onFilesGenerated(toUpdate);
        }
      }

      addMessage(project.id, targetRole, { role: 'assistant', content: fullText });

      const updated = getProject(project.id);
      if (activeRole === targetRole) {
        setMessages(updated?.roles?.[targetRole]?.messages || []);
      }
      setStreamingText(prev => ({ ...prev, [targetRole]: '' }));
      setRetryCount(0);
      setPendingUserMsg(null);
      streamParsedPaths.current[targetRole][targetRole] = new Set();
      onMessageSent();

      // Automatically continue if the response was cut off (unclosed code block)
      const backticksCount = (fullText.match(/```/g) || []).length;
      if (backticksCount % 2 !== 0) {
        setTimeout(() => {
          sendMessage('continue', targetRole);
        }, 1000);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (streamingText[targetRole]) {
          const partial = parseFilesFromContent(streamingText[targetRole], targetRole);
          if (partial.length > 0) {
            updateProjectFiles(project.id, partial);
            if (onFilesGenerated) onFilesGenerated(partial);
          }
        }
        setStreamingText(prev => ({ ...prev, [targetRole]: '' }));
        setIsLoading(prev => ({ ...prev, [targetRole]: false }));
        return;
      }
      setError(err.message || 'Unknown error');
      setStreamingText(prev => ({ ...prev, [targetRole]: '' }));
      if (retryNum < MAX_RETRIES) {
        const delay = Math.pow(2, retryNum) * 1000;
        setRetryCount(retryNum + 1);
        setTimeout(() => sendMessage(userText, targetRole, true, retryNum + 1), delay);
        return;
      }
    } finally {
      setIsLoading(prev => ({ ...prev, [targetRole]: false }));
    }
  }, [apiKey, project.id, activeRole, onMessageSent, onNeedApiKey]);

  const handleStop = () => {
    abortRefs.current[activeRole]?.abort();
    setIsLoading(prev => ({ ...prev, [activeRole]: false }));
    setStreamingText(prev => ({ ...prev, [activeRole]: '' }));
  };

  const handleClearRole = () => {
    if (confirm(`Clear all ${ROLES[activeRole].label} messages?`)) {
      clearRoleMessages(project.id, activeRole);
      setMessages([]);
      setStreamingText('');
      setError(null);
      streamParsedPaths.current = new Set();
      onMessageSent();
    }
  };

  const handleThemeConfirm = (theme) => {
    onRoleChange('builder');
    // Ensure state updates before sending message
    setTimeout(() => {
      // Create builder instruction based on theme
      const instruction = `Concept is approved. Build the application using the theme: ${theme}. Generate all necessary frontend and backend files.`;
      // Trigger send message manually (we need to bypass useCallback deps for immediate call, but we can just use the function)
      sendMessage(instruction, 'builder');
    }, 100);
  };

  const role = ROLES[activeRole];
  const hasConceptContext = activeRole === 'builder' && (project?.roles?.concept?.messages?.length || 0) > 0;
  
  // Show Theme Confirm Panel if Concept has messages, last message is from assistant, and Builder has no messages
  const shouldShowThemeConfirm = activeRole === 'concept' && 
                                 messages.length > 0 && 
                                 messages[messages.length - 1].role === 'assistant' &&
                                 (project?.roles?.builder?.messages?.length || 0) === 0 &&
                                 !isLoading[activeRole];

  // Check for incomplete blocks (unclosed backticks)
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isIncomplete = lastMessage && 
                       lastMessage.role === 'assistant' && 
                       (lastMessage.content.match(/```/g) || []).length % 2 !== 0 &&
                       !isLoading[activeRole];

  return (
    <div className="chat-panel">
      <div className="role-tabs">
        {Object.values(ROLES).map(r => {
          const count = project?.roles?.[r.id]?.messages?.filter(m => m.role === 'user').length || 0;
          const isActive = activeRole === r.id;
          return (
            <button
              key={r.id}
              className={`role-tab ${isActive ? 'active' : ''}`}
              style={{ '--role-color': r.color }}
              onClick={() => onRoleChange(r.id)}
            >
              <span className="role-icon" style={{ color: r.color }}>{r.icon}</span>
              <span>{r.short}</span>
              {count > 0 && (
                <span className="role-tab-badge" style={{ background: r.color + '22', color: r.color }}>
                  {count}
                </span>
              )}
              {isActive && <span className="role-tab-active-bar" style={{ background: r.color }} />}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {messages.length > 0 && (
          <button className="btn btn-ghost btn-sm chat-clear-btn" onClick={handleClearRole}>
            <span>🗑</span> Clear
          </button>
        )}
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {hasConceptContext && (
          <div className="chat-context-notice">
            <span className="chat-context-pulse" />
            <span>
              Context injected from: <span className="ctx-tag ctx-concept">◈ Concept</span>
            </span>
          </div>
        )}

        {messages.length === 0 && !streamingText[activeRole] && (
          <WelcomeScreen role={role} activeRole={activeRole} />
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={msg.id || i} message={msg} role={activeRole} animDelay={i * 30} />
        ))}

        {streamingText[activeRole] && <StreamingMessage text={streamingText[activeRole]} role={activeRole} />}
        {isLoading[activeRole] && !streamingText[activeRole] && <ThinkingBubble role={role} retryCount={retryCount} />}

        {shouldShowThemeConfirm && <ThemeConfirmPanel onConfirmTheme={handleThemeConfirm} />}
        {isIncomplete && <IncompleteBanner onContinue={() => sendMessage('continue')} />}

        {error && retryCount >= MAX_RETRIES && (
          <div className="error-notice animate-shake">
            <span className="error-notice-icon">⚠</span>
            <div>
              <strong>Failed after {MAX_RETRIES} retries:</strong> {error}
              <button className="btn btn-ghost btn-sm retry-btn" onClick={() => pendingUserMsg && sendMessage(pendingUserMsg)}>
                ↺ Retry Manually
              </button>
            </div>
          </div>
        )}
      </div>

      <PromptInput
        role={role}
        isLoading={isLoading[activeRole]}
        onSend={sendMessage}
        onStop={handleStop}
        hasConceptContext={hasConceptContext}
        project={project}
        onFilesGenerated={onFilesGenerated}
      />
    </div>
  );
}

function WelcomeScreen({ role, activeRole }) {
  const descriptions = {
    concept: 'I am the Discovery Agent. Tell me your idea, and I will ask a few clarifying questions before generating a complete product specification.',
    builder: 'I am the Full Stack Builder. I will generate all frontend, backend, and styling files in one go based on the confirmed Concept spec.'
  };

  const hints = {
    concept: [
      'Describe your general idea first',
      'I will ask 2-3 questions about audience, features, and vibe',
      'Once answered, I will produce a full actionable spec'
    ],
    builder: [
      'Make sure Concept spec is confirmed first',
      'I will generate complete production-ready code',
      'If I stop midway, click the Continue button'
    ]
  };

  return (
    <div className="chat-welcome">
      <div className="welcome-glow" style={{ background: `radial-gradient(circle at 50% 40%, ${role.color}18 0%, transparent 70%)` }} />
      <div className="chat-welcome-icon" style={{ color: role.color, borderColor: role.color + '33' }}>
        {role.icon}
      </div>
      <div className="chat-welcome-title">{role.label} Agent</div>
      <div className="chat-welcome-desc">{descriptions[activeRole]}</div>
      <div className="welcome-hints">
        {(hints[activeRole] || []).map((h, i) => (
          <div key={i} className="welcome-hint" style={{ animationDelay: `${i * 80}ms` }}>
            <span className="welcome-hint-dot" style={{ background: role.color }} />
            {h}
          </div>
        ))}
      </div>
      <div className="welcome-model-badge">
        <span className="model-dot" style={{ background: role.color }} />
        <span>{role.model}</span>
      </div>
    </div>
  );
}

const ChatMessage = React.memo(({ message, role, animDelay = 0 }) => {
  const isUser = message.role === 'user';
  const roleConfig = ROLES[role];
  const [isExpanded, setIsExpanded] = useState(false);

  if (isUser) {
    return (
      <div className="chat-msg-user" style={{ animationDelay: `${animDelay}ms` }}>
        <div className="chat-msg-user-bubble">
          <div className="chat-msg-user-text">{message.content}</div>
        </div>
        <div className="chat-msg-user-badge">You</div>
      </div>
    );
  }

  const hasCode = message.content.includes('\`\`\`');
  const displayContent = isExpanded ? message.content : summarizeAgentMessage(message.content);

  return (
    <div className="chat-msg-agent" style={{ animationDelay: `${animDelay}ms` }}>
      <div className="chat-msg-agent-header">
        <span className="chat-msg-agent-badge" style={{ background: roleConfig.bg, color: roleConfig.color, borderColor: roleConfig.color + '30' }}>
          {roleConfig.icon} {roleConfig.label}
        </span>
        {message.timestamp && <span className="chat-msg-time">{formatTime(message.timestamp)}</span>}
      </div>
      <div className="chat-msg-agent-bubble">
        <div className="prose chat-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
        </div>
        {hasCode && (
          <button className="chat-msg-expand-btn" onClick={() => setIsExpanded(!isExpanded)} style={{ color: roleConfig.color }}>
            {isExpanded ? '▵ Collapse Code' : '▿ Show Full Code'}
          </button>
        )}
      </div>
    </div>
  );
});

function StreamingMessage({ text, role }) {
  const roleConfig = ROLES[role];
  const summary = summarizeAgentMessage(text, true);
  const fileMatches = [...text.matchAll(/\`\`\`\w+\n(?:\/\/|#|<!--)\s*filename:\s*(.+?)(?:\s*-->)?\n/g)];
  const fileCount = fileMatches.length;

  return (
    <div className="chat-msg-agent streaming-msg">
      <div className="chat-msg-agent-header">
        <span className="chat-msg-agent-badge" style={{ background: roleConfig.bg, color: roleConfig.color }}>
          {roleConfig.icon} {roleConfig.label}
          <span className="streaming-dot-group">
            <span className="streaming-dot" style={{ background: roleConfig.color }} />
            <span className="streaming-dot" style={{ background: roleConfig.color }} />
            <span className="streaming-dot" style={{ background: roleConfig.color }} />
          </span>
        </span>
        {fileCount > 0 && (
          <span className="streaming-file-counter" style={{ color: roleConfig.color }}>
            ✦ Writing {fileCount} file{fileCount > 1 ? 's' : ''}...
          </span>
        )}
      </div>
      <div className="chat-msg-agent-bubble">
        <div className="prose chat-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
        </div>
        <div className="streaming-progress-bar">
          <div className="streaming-progress-fill" style={{ background: roleConfig.color }} />
        </div>
      </div>
    </div>
  );
}

function ThinkingBubble({ role, retryCount }) {
  const phrases = ['Thinking...', 'Analyzing...', 'Crafting response...', 'Processing...'];
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhraseIdx(i => (i + 1) % phrases.length), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="chat-msg-agent">
      <div className="chat-msg-agent-header">
        <span className="chat-msg-agent-badge" style={{ background: role.bg, color: role.color }}>
          {role.icon} {role.label}
        </span>
      </div>
      <div className="thinking-bubble">
        <div className="thinking-dots">
          <div className="thinking-dot" style={{ background: role.color }} />
          <div className="thinking-dot" style={{ background: role.color }} />
          <div className="thinking-dot" style={{ background: role.color }} />
        </div>
        <span className="thinking-label">
          {retryCount > 0 ? `Retrying... (${retryCount}/${MAX_RETRIES})` : phrases[phraseIdx]}
        </span>
      </div>
    </div>
  );
}

function PromptInput({ role, isLoading, onSend, onStop, hasConceptContext, project, onFilesGenerated }) {
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);

  const handleSubmit = () => {
    if (!text.trim() || isLoading) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const quickPrompts = {
    concept: [
      'Build a modern landing page for an AI agent',
      'Spec a productivity dashboard for remote teams',
      'Plan a mobile-first e-commerce app'
    ],
    builder: [
      'Concept approved. Build the application with Dark Cyberpunk theme.',
      'Concept approved. Build the application with Clean Minimal theme.'
    ]
  };

  const isLanjutkan = /^\s*(lanjutkan|continue|lanjut|next|teruskan)\s*$/i.test(text.trim());

  return (
    <div className={`prompt-area ${isFocused ? 'focused' : ''}`}>
      {hasConceptContext && (
        <div className="prompt-context-bar">
          <span className="ctx-bar-label">Context from:</span>
          <span className="prompt-context-tag concept-tag">◈ Concept</span>
        </div>
      )}

      {!text && !isLoading && (
        <div className="quick-prompts">
          {(quickPrompts[role.id] || []).map(p => (
            <button key={p} className="quick-prompt-btn" style={{ '--role-color': role.color }} onClick={() => { setText(p); textareaRef.current?.focus(); }}>
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="prompt-row">
        <div className="prompt-input-wrap">
          <textarea
            ref={textareaRef}
            className="prompt-textarea"
            placeholder={`Ask ${role.label} agent... (Ctrl+Enter to send)`}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            rows={1}
            disabled={isLoading[activeRole]}
          />
          {isLanjutkan && (
            <div className="lanjutkan-hint" style={{ color: role.color }}>
              ↩ Resume from last response
            </div>
          )}
          <span className="prompt-hint">⌘↵</span>
        </div>

        {isLoading[activeRole] ? (
          <button className="send-btn send-btn-stop" onClick={onStop} title="Stop generation">
            <span className="stop-icon">⬛</span>
          </button>
        ) : (
          <button className="send-btn" onClick={handleSubmit} disabled={!text.trim()} title="Send (Ctrl+Enter)" style={{ '--role-color': role.color }}>
            <span className="send-arrow">➤</span>
          </button>
        )}
      </div>
    </div>
  );
}

function summarizeAgentMessage(content, isStreaming = false) {
  if (!content) return '';
  return content.replace(/```(\w+)?\n([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
    const lines = code.trim().split('\n');
    const firstLine = lines[0] || '';
    const filenameMatch = firstLine.match(/^(?:\/\/|#|<!--|\/\*)\s*filename:\s*(.+?)(?:\s*\(continuation\))?\s*(?:\*\/|-->)?$/i);
    const filename = filenameMatch ? filenameMatch[1].trim() : null;
    const lineCount = lines.length;
    const label = filename ? `📄 ${filename}` : `${lang || 'code'} snippet`;

    if (isStreaming) {
      return `\n\n> **${label}** — ${lineCount} lines *(writing...)*\n\n`;
    }
    return `\n\n> **${label}** — ${lineCount} lines ✓ *saved to Files panel*\n\n`;
  }).trim();
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}