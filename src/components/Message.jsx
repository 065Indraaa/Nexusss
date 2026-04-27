import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ROLES, formatTime, extractCodeBlocks } from '../utils/store';

export default function Message({ message, role, isStreaming = false }) {
  const isUser = message.role === 'user';
  const roleConfig = ROLES[role];

  return (
    <div className={`message message-${isUser ? 'user' : 'agent'} animate-fade-up`}>
      <div className="message-header">
        <span
          className="message-badge"
          style={{
            '--role-color': isUser ? 'var(--text-muted)' : roleConfig.color,
            background: isUser ? 'var(--bg-tertiary)' : roleConfig.bg,
            color: isUser ? 'var(--text-secondary)' : roleConfig.color,
            border: `1px solid ${isUser ? 'var(--border)' : 'rgba(255,255,255,0.05)'}`,
            boxShadow: !isUser ? `0 2px 10px ${roleConfig.bg}` : 'none'
          }}
        >
          <span className="role-icon">{isUser ? '👤' : roleConfig.icon}</span>
          <span className="role-label">{isUser ? 'You' : roleConfig.label}</span>
          {isStreaming && <span className="streaming-dots">...</span>}
        </span>
        {message.timestamp && (
          <span className="message-time">{formatTime(message.timestamp)}</span>
        )}
      </div>

      <div className={`message-bubble ${!isUser ? 'glass-effect' : ''}`}>
        {isUser ? (
          <div className="message-user-content">
            {message.content}
          </div>
        ) : (
          <div className="prose">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const lang = match?.[1] || '';
                  if (!inline && (match || String(children).includes('\n'))) {
                    return (
                      <CodeBlock lang={lang} code={String(children).replace(/\n$/, '')} />
                    );
                  }
                  return <code className={className} {...props}>{children}</code>;
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {!isUser && !isStreaming && message.content && (
        <div className="message-actions animate-fade-in stagger-2">
          <CopyButton text={message.content} label="Copy All" />
          <DownloadCodeButton content={message.content} />
        </div>
      )}
    </div>
  );
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleDownload = () => {
    const ext = getExtension(lang);
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="code-block-wrapper animate-fade-in stagger-3">
      <div className="code-block-header">
        <div className="code-block-meta">
          <span className="code-block-icon">📄</span>
          <span className="code-block-lang">{lang || 'text'}</span>
        </div>
        <div className="code-block-actions">
          <button className={`code-block-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
            {copied ? '✓ Copied' : '⎘ Copy'}
          </button>
          <button className="code-block-btn" onClick={handleDownload}>
            ↓ Download
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={lang || 'text'}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          borderRadius: '0 0 var(--radius-md) var(--radius-md)',
          background: 'rgba(10, 10, 20, 0.5)',
          fontSize: '13px',
          lineHeight: '1.6',
          padding: '20px',
          fontFamily: 'var(--font-code)',
          border: '1px solid var(--border)',
          borderTop: 'none'
        }}
        showLineNumbers={code.split('\n').length > 5}
        lineNumberStyle={{ color: '#404050', fontSize: '11px', userSelect: 'none', paddingRight: '12px' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  return (
    <button className={`code-block-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? '✓ Copied' : `⎘ ${label}`}
    </button>
  );
}

function DownloadCodeButton({ content }) {
  const blocks = extractCodeBlocks(content);
  if (blocks.length === 0) return null;

  const handleDownload = () => {
    if (blocks.length === 1) {
      const ext = getExtension(blocks[0].lang);
      const blob = new Blob([blocks[0].code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `code.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // Multiple blocks: download all as combined
      const combined = blocks.map((b, i) =>
        `// ── Block ${i + 1} (${b.lang}) ──\n${b.code}`
      ).join('\n\n');
      const blob = new Blob([combined], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'code-blocks.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <button className="code-block-btn" onClick={handleDownload}>
      ↓ Download Code{blocks.length > 1 ? ` (${blocks.length})` : ''}
    </button>
  );
}

function getExtension(lang) {
  const map = {
    javascript: 'js', js: 'js', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx',
    python: 'py', py: 'py', html: 'html', css: 'css', scss: 'scss',
    json: 'json', yaml: 'yml', yml: 'yml', markdown: 'md', md: 'md',
    sql: 'sql', bash: 'sh', sh: 'sh', shell: 'sh', rust: 'rs', go: 'go',
    java: 'java', php: 'php', ruby: 'rb', swift: 'swift', kotlin: 'kt',
    vue: 'vue', svelte: 'svelte', toml: 'toml', dockerfile: 'Dockerfile'
  };
  return map[lang?.toLowerCase()] || 'txt';
}
