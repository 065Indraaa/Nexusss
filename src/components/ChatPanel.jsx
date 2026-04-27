import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ROLES, callAI, addMessage, buildContextMessages,
  getProject, clearRoleMessages, parseFilesFromContent, updateProjectFiles
} from '../utils/store';

const MAX_RETRIES = 3;

// ── Realtime file parser during streaming ──────────────────
// Parses COMPLETE code blocks only (closes with ```) from partial stream text.
// Returns only newly-completed blocks not yet seen.
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

// ── Main ChatPanel ─────────────────────────────────────────
export default function ChatPanel({
  project, activeRole, onRoleChange, apiKey,
  onMessageSent, onNeedApiKey, onFilesGenerated
}) {
  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [pendingUserMsg, setPendingUserMsg] = useState(null);
  // Track which file paths were already pushed to the panel during THIS stream
  const streamParsedPaths = useRef(new Set());
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  // Load messages when role/project changes
  useEffect(() => {
    const fresh = getProject(project.id);
    setMessages(fresh?.roles[activeRole]?.messages || []);
    setStreamingText('');
    setError(null);
    setRetryCount(0);
    streamParsedPaths.current = new Set();
  }, [project.id, activeRole]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const sendMessage = useCallback(async (userText, isRetry = false, retryNum = 0) => {
    if (!apiKey) { onNeedApiKey(); return; }
    if (!userText.trim()) return;

    setError(null);
    setIsLoading(true);
    setStreamingText('');
    streamParsedPaths.current = new Set();

    if (!isRetry) {
      setPendingUserMsg(userText);
      addMessage(project.id, activeRole, { role: 'user', content: userText });
      const fresh = getProject(project.id);
      setMessages(fresh.roles[activeRole].messages);
    }

    const fresh = getProject(project.id);
    const contextMessages = buildContextMessages(fresh, activeRole);

    // Remove the last user message from context (we're sending it separately)
    const trimmedContext = contextMessages.slice(0, -1);

    abortRef.current = new AbortController();

    try {
      let prompt = userText;
      if (isRetry && retryNum > 0) {
        prompt = `[Retry ${retryNum}/${MAX_RETRIES}] Please regenerate your previous response.\n\nOriginal request: ${userText}`;
      }

      // Detect "lanjutkan" / "continue" — inject a resume instruction
      const isResume = /^\s*(lanjutkan|continue|lanjut|next|teruskan)\s*$/i.test(userText.trim());
      if (isResume) {
        const lastAssistantMsg = [...(fresh.roles[activeRole].messages)]
          .reverse()
          .find(m => m.role === 'assistant');
        if (lastAssistantMsg) {
          const fullContent = lastAssistantMsg.content.trim();
          const allLines = fullContent.split('\n');
          // Get last 20 lines for solid anchoring
          const lastLines = allLines.slice(-20).join('\n');
          const totalLineCount = allLines.length;
          
          // Detect the last filename being written
          const filenameMatches = [...fullContent.matchAll(/\/\/\s*filename:\s*(.+?)(?:\s*\(continuation\))?\s*$/gmi)];
          const lastFilename = filenameMatches.length > 0 ? filenameMatches[filenameMatches.length - 1][1].trim() : null;

          prompt = `[CRITICAL — CONTINUE / LANJUTKAN INSTRUCTION]

You were writing a response and got cut off. Here is what you MUST do:

1. DO NOT restart any file from line 1. DO NOT re-output code already written.
2. DO NOT re-introduce the project, repeat headings, or summarize.
3. Pick up from the EXACT character where your previous response ended.
4. IMPORTANT: Always start a NEW code block (using triple backticks) even if your last one was left open. 
5. The FIRST line of your new code block must be: // filename: ${lastFilename || 'path/to/file'} (continuation)
6. Use this (continuation) marker exactly.

${lastFilename ? `YOUR LAST FILE WAS: ${lastFilename} (you were at approximately line ~${totalLineCount})` : `You delivered approximately ${totalLineCount} lines total.`}

Your previous response ended with these exact lines:
------
${lastLines}
------

Now continue IMMEDIATELY from that exact point. No preamble. No summary. Just the next line of code.`;
        }
      }

      const roleConfig = ROLES[activeRole];
      const fullText = await callAI(
        apiKey, roleConfig.model, roleConfig.systemPrompt, trimmedContext, prompt,
        (partial) => {
          setStreamingText(partial);

          // ── Realtime file parsing during stream ──
          const newFiles = parseCompletedBlocksFromStream(
            partial,
            streamParsedPaths.current
          );
          if (newFiles.length > 0) {
            // Mark these paths as already pushed
            newFiles.forEach(f => streamParsedPaths.current.add(f.path));

            // Tag with role and update immediately
            const tagged = newFiles.map(f => ({ ...f, role: activeRole }));
            updateProjectFiles(project.id, tagged);
            if (onFilesGenerated) onFilesGenerated(tagged);
          }
        },
        abortRef.current.signal
      );

      // filename: src/components/ChatPanel.jsx  (inside sendMessage, after stream ends)

      // Final parse after stream ends — only handle files with filename comments
      const allFiles = parseFilesFromContent(fullText, activeRole);

      // Split into: files not yet pushed vs already pushed (need content update)
      const unpushed = allFiles.filter(f => !streamParsedPaths.current.has(f.path));
      const alreadyPushed = allFiles.filter(f => streamParsedPaths.current.has(f.path));

      // Push new files
      if (unpushed.length > 0) {
        updateProjectFiles(project.id, unpushed);
        if (onFilesGenerated) onFilesGenerated(unpushed);
      }

      // Update existing files (content may be longer now that stream is complete)
      // Only update if the final content is actually longer than what was streamed
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

      addMessage(project.id, activeRole, { role: 'assistant', content: fullText });

      const updated = getProject(project.id);
      setMessages(updated.roles[activeRole].messages);
      setStreamingText('');
      setRetryCount(0);
      setPendingUserMsg(null);
      streamParsedPaths.current = new Set();
      onMessageSent();
    } catch (err) {
      if (err.name === 'AbortError') {
        // On abort, still parse whatever was streamed
        if (streamingText) {
          const partial = parseFilesFromContent(streamingText, activeRole);
          if (partial.length > 0) {
            updateProjectFiles(project.id, partial);
            if (onFilesGenerated) onFilesGenerated(partial);
          }
        }
        setStreamingText('');
        setIsLoading(false);
        return;
      }
      setError(err.message || 'Unknown error');
      setStreamingText('');

      if (retryNum < MAX_RETRIES) {
        const delay = Math.pow(2, retryNum) * 1000;
        setRetryCount(retryNum + 1);
        setTimeout(() => sendMessage(userText, true, retryNum + 1), delay);
        return;
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, project.id, activeRole, onMessageSent, onNeedApiKey, streamingText]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setStreamingText('');
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

  const role = ROLES[activeRole];
  const hasConceptContext = (activeRole === 'frontend' || activeRole === 'backend') &&
    project.roles.concept.messages.length > 0;
  const hasFrontendContext = activeRole === 'backend' &&
    project.roles.frontend.messages.length > 0;

  return (
    <div className="chat-panel">
      {/* ── Role Tabs ── */}
      <div className="role-tabs">
        {Object.values(ROLES).map(r => {
          const count = project.roles[r.id].messages.filter(m => m.role === 'user').length;
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

      {/* ── Messages ── */}
      <div className="chat-messages" ref={scrollRef}>
        {(hasConceptContext || hasFrontendContext) && (
          <div className="chat-context-notice">
            <span className="chat-context-pulse" />
            <span>
              Context injected from:
              {hasConceptContext && <span className="ctx-tag ctx-concept">◈ Concept</span>}
              {hasFrontendContext && <span className="ctx-tag ctx-frontend">◇ Frontend</span>}
            </span>
          </div>
        )}

        {messages.length === 0 && !streamingText && (
          <WelcomeScreen role={role} activeRole={activeRole} />
        )}

        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id || i}
            message={msg}
            role={activeRole}
            animDelay={i * 30}
          />
        ))}

        {streamingText && (
          <StreamingMessage text={streamingText} role={activeRole} />
        )}

        {isLoading && !streamingText && (
          <ThinkingBubble role={role} retryCount={retryCount} />
        )}

        {error && retryCount >= MAX_RETRIES && (
          <div className="error-notice animate-shake">
            <span className="error-notice-icon">⚠</span>
            <div>
              <strong>Failed after {MAX_RETRIES} retries:</strong> {error}
              {(error.toLowerCase().includes('fetch') || error.toLowerCase().includes('proxy')) && (
                <div className="error-tip">
                  💡 Make sure the proxy server is running: <code>npm run dev</code>
                </div>
              )}
              <button className="btn btn-ghost btn-sm retry-btn" onClick={() => pendingUserMsg && sendMessage(pendingUserMsg)}>
                ↺ Retry Manually
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <PromptInput
        role={role}
        isLoading={isLoading}
        onSend={sendMessage}
        onStop={handleStop}
        hasConceptContext={hasConceptContext}
        hasFrontendContext={hasFrontendContext}
        project={project}
        onFilesGenerated={onFilesGenerated}
      />
    </div>
  );
}

// ── Welcome Screen ─────────────────────────────────────────
function WelcomeScreen({ role, activeRole }) {
  const descriptions = {
    concept: 'Describe your project vision. I\'ll develop business logic, features, user journeys, and complete copywriting — researching your domain to write a precise, publication-ready product spec.',
    frontend: 'Tell me what to build. I\'ll create a stunning, fully interactive UI with complete file structure, dark mode, animations, responsive design, and every component you need.',
    backend: 'Describe your backend needs. I\'ll generate a complete, production-ready API: Express routes, SQLite schema, validation, error handling — aligned exactly with your frontend.'
  };

  const hints = {
    concept: [
      'Describe your target audience and the core problem this solves',
      'Mention any competitor apps or references you like',
      'Specify must-have features — be explicit, no vague requirements'
    ],
    frontend: [
      'Start with: "Based on the concept spec above, build the full UI"',
      'Specify vibe: dark/light, Solana-style, minimalist, glassmorphism...',
      'Mention key interactions: animations, hover states, mobile behavior'
    ],
    backend: [
      'Start with: "Based on concept + frontend above, build the API"',
      'List any environment variables needed (API keys, DB path, port)',
      'Specify if you need auth — otherwise backend skips it by default'
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

// ── Chat Message ───────────────────────────────────────────
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

  const hasCode = message.content.includes('```');
  const displayContent = isExpanded
    ? message.content
    : summarizeAgentMessage(message.content);

  return (
    <div className="chat-msg-agent" style={{ animationDelay: `${animDelay}ms` }}>
      <div className="chat-msg-agent-header">
        <span
          className="chat-msg-agent-badge"
          style={{ background: roleConfig.bg, color: roleConfig.color, borderColor: roleConfig.color + '30' }}
        >
          {roleConfig.icon} {roleConfig.label}
        </span>
        {message.timestamp && (
          <span className="chat-msg-time">{formatTime(message.timestamp)}</span>
        )}
      </div>
      <div className="chat-msg-agent-bubble">
        <div className="prose chat-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {displayContent}
          </ReactMarkdown>
        </div>
        {hasCode && (
          <button
            className="chat-msg-expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ color: roleConfig.color }}
          >
            {isExpanded ? '▵ Collapse Code' : '▿ Show Full Code'}
          </button>
        )}
      </div>
    </div>
  );
});

// ── Streaming Message ──────────────────────────────────────
function StreamingMessage({ text, role }) {
  const roleConfig = ROLES[role];
  const summary = summarizeAgentMessage(text, true);

  // Count files being written
  const fileMatches = [...text.matchAll(/```\w+\n(?:\/\/|#|<!--)\s*filename:\s*(.+?)(?:\s*-->)?\n/g)];
  const fileCount = fileMatches.length;

  return (
    <div className="chat-msg-agent streaming-msg">
      <div className="chat-msg-agent-header">
        <span
          className="chat-msg-agent-badge"
          style={{ background: roleConfig.bg, color: roleConfig.color }}
        >
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {summary}
          </ReactMarkdown>
        </div>
        <div className="streaming-progress-bar">
          <div
            className="streaming-progress-fill"
            style={{ background: roleConfig.color }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Thinking Bubble ────────────────────────────────────────
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

// ── Prompt Input ───────────────────────────────────────────
function PromptInput({
  role, isLoading, onSend, onStop,
  hasConceptContext, hasFrontendContext,
  project, onFilesGenerated
}) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const processFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setAttachments(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name, type: file.type, data: e.target.result
      }]);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if ((!text.trim() && attachments.length === 0) || isLoading) return;

    if (attachments.length > 0) {
      const filesToSave = attachments.map(att => ({
        path: `assets/${att.name}`, content: att.data,
        lang: att.type.split('/')[1] || 'png',
        role: role.id, updatedAt: new Date().toISOString()
      }));
      updateProjectFiles(project.id, filesToSave);
    }

    const attachmentNote = attachments.length > 0
      ? `\n\n[Attached Assets: ${attachments.map(a => `assets/${a.name}`).join(', ')}]`
      : '';

    onSend(text.trim() + attachmentNote);
    setText('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onFilesGenerated && onFilesGenerated();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) processFile(items[i].getAsFile());
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const quickPrompts = {
    concept: [
      'Build a Solana token landing page with lore, tokenomics, and roadmap',
      'Plan a Web3 NFT marketplace for digital collectors',
      'Spec a crypto portfolio tracker with real-time prices'
    ],
    frontend: [
      'Based on the concept spec above, build the complete UI with dark mode and heavy animations',
      'Create a Solana token site with hero, tokenomics chart, and live price from DexScreener',
      'Build a glassmorphism dashboard with animated stats and interactive charts'
    ],
    backend: [
      'Based on concept + frontend above, build the complete Express + SQLite API',
      'Build a proxy API for DexScreener with 30s caching to avoid rate limits',
      'Create a REST API with full CRUD, validation, and error handling'
    ]
  };

  const isLanjutkan = /^\s*(lanjutkan|continue|lanjut|next|teruskan)\s*$/i.test(text.trim());

  return (
    <div className={`prompt-area ${isFocused ? 'focused' : ''}`}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => processFile(e.target.files[0])}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {(hasConceptContext || hasFrontendContext) && (
        <div className="prompt-context-bar">
          <span className="ctx-bar-label">Context from:</span>
          {hasConceptContext && (
            <span className="prompt-context-tag concept-tag">◈ Concept</span>
          )}
          {hasFrontendContext && (
            <span className="prompt-context-tag frontend-tag">◇ Frontend</span>
          )}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="prompt-attachments">
          {attachments.map(att => (
            <div key={att.id} className="attachment-chip">
              <img src={att.data} alt="thumb" className="attachment-thumb" />
              <span className="attachment-name">{att.name}</span>
              <button className="attachment-remove" onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}>✕</button>
            </div>
          ))}
        </div>
      )}

      {!text && !isLoading && attachments.length === 0 && (
        <div className="quick-prompts">
          {(quickPrompts[role.id] || []).map(p => (
            <button
              key={p}
              className="quick-prompt-btn"
              style={{ '--role-color': role.color }}
              onClick={() => { setText(p); textareaRef.current?.focus(); }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="prompt-row">
        <button
          className="btn-upload"
          onClick={() => fileInputRef.current?.click()}
          title="Upload image asset"
          disabled={isLoading}
        >
          🖼
        </button>

        <div className="prompt-input-wrap">
          <textarea
            ref={textareaRef}
            className="prompt-textarea"
            placeholder={`Ask ${role.label} agent... (Ctrl+Enter to send)`}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            rows={1}
            disabled={isLoading}
          />
          {isLanjutkan && (
            <div className="lanjutkan-hint" style={{ color: role.color }}>
              ↩ Resume from last response
            </div>
          )}
          <span className="prompt-hint">⌘↵</span>
        </div>

        {isLoading ? (
          <button className="send-btn send-btn-stop" onClick={onStop} title="Stop generation">
            <span className="stop-icon">⬛</span>
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={handleSubmit}
            disabled={!text.trim() && attachments.length === 0}
            title="Send (Ctrl+Enter)"
            style={{ '--role-color': role.color }}
          >
            <span className="send-arrow">➤</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────
function summarizeAgentMessage(content, isStreaming = false) {
  if (!content) return '';

  return content.replace(/```(\w+)?\n([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
    const lines = code.trim().split('\n');
    const firstLine = lines[0];
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