import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { buildFileTree, WS_BASE, PROXY_BASE } from '../utils/store';
import JSZip from 'jszip';
import sdk from '@stackblitz/sdk';

const LANG_ICONS = {
  jsx: '⚛', tsx: '⚛', js: '𝒿', ts: '𝒯', html: '⬡', css: '🎨',
  scss: '🎨', json: '{ }', md: '📄', py: '🐍', sh: '⚡',
  yaml: '⚙', yml: '⚙', go: '🔵', rs: '🦀', java: '☕',
  vue: '💚', svelte: '🧡', sql: '💾', dockerfile: '🐳', txt: '📝',
  env: '🔒', prisma: '🔺', graphql: '◈'
};

const getLangIcon = (lang) => LANG_ICONS[lang?.toLowerCase()] || '📄';
const PREVIEW_TABS = ['files', 'code', 'preview', 'terminal'];

// ── File Tree Node ─────────────────────────────────────────
function FileNode({ node, depth = 0, selected, onSelect, expanded, onToggle, isNew }) {
  const isDir = node.type === 'dir';
  const isExp = expanded[node.path];
  const isSelected = selected?.path === node.path;
  const children = isDir
    ? Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    : [];

  return (
    <div className={isNew ? 'file-node-new' : ''}>
      <div
        className={`file-node ${isSelected ? 'selected' : ''} ${isDir ? 'dir' : 'file'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => isDir ? onToggle(node.path) : onSelect(node)}
      >
        <span className="file-node-arrow">
          {isDir ? (isExp ? '▾' : '▸') : ''}
        </span>
        <span className="file-node-icon">
          {isDir ? (isExp ? '📂' : '📁') : getLangIcon(node.lang)}
        </span>
        <span className="file-node-name">{node.name}</span>
        {!isDir && node.content && (
          <span className="file-node-size">
            {(node.content.length / 1024).toFixed(1)}k
          </span>
        )}
        {isNew && <span className="file-node-new-badge">new</span>}
      </div>
      {isDir && isExp && children.map(child => (
        <FileNode
          key={child.path || child.name}
          node={child}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

// ── Terminal Component ─────────────────────────────────────
function TerminalPanel({ projectId }) {
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const [lines, setLines] = useState([
    { text: '# NEXUS AI Terminal', type: 'info' },
    { text: '# Connecting to project directory...', type: 'info' }
  ]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [cwd, setCwd] = useState('');

  useEffect(() => {
    let isUnmounted = false;
    let ws = null;

    async function initTerminal() {
      try {
        let targetDir;
        if (projectId) {
          const res = await fetch(`${PROXY_BASE}/api/projects/${projectId}/dir`);
          if (res.ok) { const d = await res.json(); targetDir = d.dir; }
        }
        if (isUnmounted) return;

        ws = new WebSocket(WS_BASE);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          ws.send(JSON.stringify({ type: 'init', cwd: targetDir }));
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'ready') {
              setCwd(msg.cwd);
              setLines(prev => [
                ...prev.filter(l => !l.text.includes('Connecting')),
                { text: `✓ Connected: ${msg.cwd}`, type: 'success' },
                { text: '', type: 'blank' }
              ]);
            } else if (msg.type === 'output') {
              const newLines = msg.data.split('\n').map(l => ({ text: l, type: 'output' }));
              setLines(prev => [...prev, ...newLines]);
            } else if (msg.type === 'cmd_done') {
              setLines(prev => [
                ...prev,
                { text: `[Exit: ${msg.code}]`, type: msg.code === 0 ? 'success' : 'error' }
              ]);
            } else if (msg.type === 'exit') {
              if (!isUnmounted) {
                setLines(prev => [...prev, { text: `Shell exited (${msg.code})`, type: 'info' }]);
                setConnected(false);
              }
            }
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          setConnected(false);
          if (!isUnmounted)
            setLines(prev => [...prev, { text: '⚠ Disconnected. Refresh to reconnect.', type: 'error' }]);
        };

        ws.onerror = () => {
          if (!isUnmounted)
            setLines(prev => [
              ...prev,
              { text: `⚠ Cannot reach terminal (${WS_BASE})`, type: 'error' },
              { text: 'Running locally? Make sure you ran "npm run dev".', type: 'info' },
              { text: 'On Vercel? Use the ⚡ Cloud IDE button instead.', type: 'success' }
            ]);
        };
      } catch (err) {
        if (!isUnmounted)
          setLines(prev => [...prev, { text: `⚠ Init failed: ${err.message}`, type: 'error' }]);
      }
    }

    initTerminal();
    return () => { isUnmounted = true; ws?.close(); };
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const sendCmd = (cmd) => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    setLines(prev => [...prev, { text: `$ ${cmd}`, type: 'cmd' }]);
    wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\n' }));
  };

  const quickCommands = [
    { label: 'npm i', cmd: 'npm install' },
    { label: 'dev', cmd: 'npm run dev' },
    { label: 'build', cmd: 'npm run build' },
    { label: 'create-vite', cmd: 'npx -y create-vite@latest ./ --template react' },
    { label: 'ls', cmd: 'ls' },
    { label: 'pwd', cmd: 'pwd' },
    { label: 'clear', cmd: 'clear' },
  ];

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="terminal-title">⚡ Terminal</span>
        <div className={`terminal-status ${connected ? 'connected' : 'disconnected'}`}>
          <span className="terminal-dot" />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
        <div className="terminal-quick-cmds">
          {quickCommands.map(q => (
            <button key={q.label} className="terminal-quick-btn" onClick={() => sendCmd(q.cmd)}>
              {q.label}
            </button>
          ))}
        </div>
      </div>
      <div className="terminal-output" ref={termRef}>
        {lines.map((line, i) => (
          <div key={i} className={`terminal-line terminal-line-${line.type}`}>
            {line.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="terminal-input-row">
        <span className="terminal-prompt">{cwd ? `${cwd.split(/[/\\]/).pop()} $` : '$'}</span>
        <input
          className="terminal-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { sendCmd(input); setInput(''); } }}
          placeholder="Type a command..."
          disabled={!connected}
          spellCheck={false}
          autoCapitalize="none"
        />
      </div>
    </div>
  );
}

// ── HTML Preview ───────────────────────────────────────────
function HtmlPreview({ files }) {
  const iframeRef = useRef(null);

  const combined = useMemo(() => {
    const htmlFile = files.find(f => f.lang === 'html' || f.path.endsWith('.html'));
    const cssFiles = files.filter(f => f.lang === 'css' || f.path.endsWith('.css'));
    const jsFiles = files.filter(f => (f.lang === 'javascript' || f.lang === 'js') && !f.path.includes('package'));
    const assetFiles = files.filter(f => f.path.startsWith('assets/'));

    if (!htmlFile) {
      const css = cssFiles.map(f => `<style>\n${f.content}\n</style>`).join('\n');
      const js = jsFiles.map(f => `<script>\n${f.content}\n</script>`).join('\n');
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body>${js}</body></html>`;
    }

    let html = htmlFile.content || '';
    cssFiles.forEach(cssFile => {
      const tag = `<link rel="stylesheet" href="${cssFile.path.split('/').pop()}">`;
      html = html.includes(tag)
        ? html.replace(tag, `<style>\n${cssFile.content}\n</style>`)
        : html.replace('</head>', `<style>\n${cssFile.content}\n</style>\n</head>`);
    });
    jsFiles.forEach(jsFile => {
      const tag = `<script src="${jsFile.path.split('/').pop()}"></script>`;
      const tagWithDefer = `<script src="${jsFile.path.split('/').pop()}" defer></script>`;
      html = html.includes(tag)
        ? html.replace(tag, `<script>\n${jsFile.content}\n</script>`)
        : html.includes(tagWithDefer)
        ? html.replace(tagWithDefer, `<script>\n${jsFile.content}\n</script>`)
        : html.replace('</body>', `<script>\n${jsFile.content}\n</script>\n</body>`);
    });
    assetFiles.forEach(asset => {
      const filename = asset.path.split('/').pop();
      [asset.path, `./${asset.path}`, filename].forEach(sp => {
        html = html.replace(new RegExp(`src=["']${sp}["']`, 'g'), `src="${asset.content}"`);
      });
    });
    return html;
  }, [files]);

  useEffect(() => {
    if (iframeRef.current && combined) {
        // Use srcdoc instead of document.write for better stability
        iframeRef.current.srcdoc = combined;
    }
  }, [combined]);

  return (
    <div className="html-preview" style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fff' }}>
      <div className="preview-toolbar" style={{ display: 'flex', gap: '8px', padding: '8px', background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
        <span className="preview-toolbar-label" style={{ fontWeight: 600, color: '#333', flex: 1 }}>🌐 Live Preview</span>
        <button className="btn btn-ghost btn-sm" onClick={() => {
          const blob = new Blob([combined], { type: 'text/html' });
          window.open(URL.createObjectURL(blob), '_blank');
        }} style={{ color: '#0066cc', cursor: 'pointer', background: 'transparent', border: 'none' }}>↗ Open in Tab</button>
        <button className="btn btn-ghost btn-sm" onClick={() => {
          if (iframeRef.current) {
            iframeRef.current.srcdoc = combined + '<!-- refreshed ' + Date.now() + ' -->';
          }
        }} style={{ color: '#0066cc', cursor: 'pointer', background: 'transparent', border: 'none' }}>↺ Refresh</button>
      </div>
      <iframe
        ref={iframeRef}
        className="preview-iframe"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Live Preview"
        style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
      />
    </div>
  );
}

// ── StackBlitz Preview ───────────────────────────────────────────
function StackBlitzPreview({ files, projectType, projectName, projectDesc }) {
  const containerRef = useRef(null);
  const vmRef = useRef(null);

  useEffect(() => {
    if (!files || files.length === 0 || !containerRef.current) return;

    // Convert array of file objects to StackBlitz files object
    const sbFiles = {};
    files.forEach(f => {
      // Strip leading slashes if any
      const path = f.path.replace(/^\//, '');
      sbFiles[path] = f.content;
    });

    if (vmRef.current) {
        // VM already exists, just apply diffs so it doesn't blink/reload entirely
        vmRef.current.applyFsDiff({
            create: sbFiles,
            destroy: []
        }).catch(err => console.error("StackBlitz diff error", err));
        return;
    }

    let template = 'node';
    if (projectType === 'html') template = 'html';
    else if (projectType === 'react') template = 'create-react-app'; // StackBlitz natively supports create-react-app
    else if (projectType === 'vue') template = 'node';

    // Embed StackBlitz project
    sdk.embedProject(containerRef.current, {
      title: projectName || 'NEXUS AI Project',
      description: projectDesc || 'Generated by NEXUS AI',
      template: template,
      files: sbFiles,
      settings: {
        compile: { clearConsole: true },
      },
    }, {
      height: '100%',
      width: '100%',
      hideNavigation: true,
      hideDevTools: false,
      hideExplorer: true,
      forceEmbedLayout: true
    }).then(vm => {
        vmRef.current = vm;
    }).catch(err => {
        console.error("Failed to embed StackBlitz block", err);
    });
  }, [files, projectType, projectName, projectDesc]);

  // Cleanup on unmount or project change
  useEffect(() => {
    return () => {
        vmRef.current = null;
    }
  }, [projectName]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', border: 'none', flex: 1, backgroundColor: '#0a0a0a' }} />;
}

// ── Main Preview Panel ─────────────────────────────────────
export default function PreviewPanel({ project, activeRole, onUpdateFiles }) {
  const [tab, setTab] = useState('preview');
  const [selectedFile, setSelectedFile] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  // Track newly added files for highlight animation
  const [newFilePaths, setNewFilePaths] = useState(new Set());
  const prevFileCountRef = useRef(0);

  const files = project?.generatedFiles || [];
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const hasFiles = files.length > 0;

  // ── Realtime: auto-select + expand + highlight new files ──
  useEffect(() => {
    if (files.length === 0) return;

    const prevCount = prevFileCountRef.current;
    prevFileCountRef.current = files.length;

    // Detect newly added files
    if (files.length > prevCount) {
      const addedFiles = files.slice(prevCount);
      const addedPaths = new Set(addedFiles.map(f => f.path));
      setNewFilePaths(addedPaths);

      // Auto-select the latest file
      const latest = addedFiles[addedFiles.length - 1];
      if (latest) {
        setSelectedFile(latest);
        // Switch to code tab so user sees the file immediately
        setTab('code');
      }

      // Clear highlight after 2s
      const t = setTimeout(() => setNewFilePaths(new Set()), 2000);
      return () => clearTimeout(t);
    }

    // Sync selected file content when AI updates it
    if (selectedFile) {
      const latest = files.find(f => f.path === selectedFile.path);
      if (latest && latest.content !== selectedFile.content) {
        setSelectedFile(latest);
      }
    }
  }, [files]);

  // Auto-expand directories
  useEffect(() => {
    if (files.length === 0) return;
    const newExpanded = {};
    files.forEach(f => {
      const parts = f.path.split('/');
      if (parts.length > 1) {
        newExpanded[parts[0]] = true;
        if (parts.length > 2) newExpanded[parts.slice(0, 2).join('/')] = true;
      }
    });
    setExpanded(prev => ({ ...prev, ...newExpanded }));
  }, [files.length]);

  const handleSelectFile = (node) => {
    setSelectedFile(node);
    setTab('code');
  };

  const toggleDir = (path) => setExpanded(prev => ({ ...prev, [path]: !prev[path] }));

  const handleCopyCode = async () => {
    if (!selectedFile?.content) return;
    await navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadAll = async () => {
    if (!files.length) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(project.name.replace(/\s+/g, '-').toLowerCase());
      files.forEach(f => folder.file(f.path, f.content));
      if (!files.find(f => /readme\.md/i.test(f.path))) {
        folder.file('README.md', `# ${project.name}\n\n${project.description || ''}\n\nGenerated by NEXUS AI\n`);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}-nexus.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsZipping(false);
    }
  };

  const handleOpenInStackBlitz = () => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://stackblitz.com/run';
    form.target = '_blank';
    const addField = (name, value) => {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = name; input.value = value;
      form.appendChild(input);
    };
    addField('project[title]', project.name);
    addField('project[description]', project.description || 'Generated by NEXUS AI');
    
    let template = 'node';
    if (project.projectType === 'html') template = 'html';
    else if (project.projectType === 'react') template = 'create-react-app';
    
    addField('project[template]', template);
    addField('project[settings]', JSON.stringify({ compile: { clearConsole: true } }));
    files.forEach(f => addField(`project[files][${f.path.replace(/^\//, '')}]`, f.content));
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  const topChildren = Object.values(fileTree.children).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="preview-panel">
      {/* ── Tab Bar ── */}
      <div className="preview-tab-bar">
        {PREVIEW_TABS.map(t => (
          <button
            key={t}
            className={`preview-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'files' && '📁 Files'}
            {t === 'code' && '⌨ Code'}
            {t === 'preview' && '🌐 Preview'}
            {t === 'terminal' && '⚡ Terminal'}
            {t === 'files' && hasFiles && (
              <span className="preview-tab-badge">{files.length}</span>
            )}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {hasFiles && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="btn btn-ghost btn-sm cloud-ide-btn"
              onClick={handleOpenInStackBlitz}
              title="Open in StackBlitz"
            >
              ⚡ Cloud IDE
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleDownloadAll}
              disabled={isZipping}
              title="Download ZIP"
            >
              {isZipping ? '⏳ Zipping...' : '⬇ ZIP'}
            </button>
          </div>
        )}
      </div>

      {/* ── Tab Content ── */}
      <div className="preview-body">

        {/* FILES */}
        <div style={{ display: tab === 'files' ? 'block' : 'none', height: '100%', overflow: 'hidden' }}>
          <div className="preview-files">
            {!hasFiles ? (
              <EmptyState
                icon="📁"
                title="No files yet"
                desc={'Ask the Builder agent to generate code.\nFiles appear here in realtime as the AI writes them.'}
              />
            ) : (
              <div className="file-tree">
                <div className="file-tree-header">
                  <span className="file-tree-project-name">{project.name}</span>
                  <span className="file-tree-count">{files.length} file{files.length !== 1 ? 's' : ''}</span>
                </div>
                {topChildren.map(child => (
                  <FileNode
                    key={child.path || child.name}
                    node={child}
                    depth={0}
                    selected={selectedFile}
                    onSelect={handleSelectFile}
                    expanded={expanded}
                    onToggle={toggleDir}
                    isNew={newFilePaths.has(child.path)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CODE */}
        <div style={{ display: tab === 'code' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div className="preview-code">
            {!selectedFile ? (
              <EmptyState
                icon="⌨"
                title="Select a file"
                desc="Choose a file from the Files tab to view its code here."
              />
            ) : (
              <>
                <div className="code-viewer-header">
                  <div className="code-viewer-breadcrumb">
                    {selectedFile.path.split('/').map((part, i, arr) => (
                      <span key={i}>
                        <span className={i === arr.length - 1 ? 'breadcrumb-file' : 'breadcrumb-dir'}>
                          {i === arr.length - 1 ? `${getLangIcon(selectedFile.lang)} ${part}` : part}
                        </span>
                        {i < arr.length - 1 && <span className="breadcrumb-sep">/</span>}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className={`code-block-btn ${copied ? 'copied' : ''}`} onClick={handleCopyCode}>
                      {copied ? '✓ Copied' : '⎘ Copy'}
                    </button>
                    <button className="code-block-btn" onClick={() => {
                      const blob = new Blob([selectedFile.content], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = selectedFile.name; a.click();
                      URL.revokeObjectURL(url);
                    }}>↓ Download</button>
                  </div>
                </div>

                <div className="code-viewer-body">
                  {/* Image preview */}
                  {(selectedFile.path?.match(/\.(png|jpe?g|gif|svg|webp)$/i) || selectedFile.content?.startsWith('data:image/')) ? (
                    <div className="image-preview-wrap">
                      <img src={selectedFile.content} alt={selectedFile.path} className="preview-image" />
                      <div className="image-preview-label">{selectedFile.path} — Image Asset</div>
                    </div>
                  ) : (
                    <SyntaxHighlighter
                      language={selectedFile.lang || 'text'}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0, borderRadius: 0,
                        background: '#0a0a12',
                        fontSize: '13px', lineHeight: '1.6',
                        padding: '20px',
                        fontFamily: 'var(--font-code)',
                        minHeight: '100%'
                      }}
                      showLineNumbers={(selectedFile.content?.split('\n').length || 0) > 3}
                      lineNumberStyle={{ color: '#2d2d4e', fontSize: '11px', userSelect: 'none', minWidth: '40px' }}
                    >
                      {selectedFile.content || ''}
                    </SyntaxHighlighter>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* PREVIEW */}
        <div style={{ display: tab === 'preview' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {project?.projectType === 'html' ? (
            <HtmlPreview files={files} />
          ) : (
            <StackBlitzPreview files={files} projectType={project?.projectType} projectName={project?.name} projectDesc={project?.description} />
          )}
        </div>

        {/* TERMINAL */}
        <div style={{ display: tab === 'terminal' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <TerminalPanel projectId={project?.id} />
        </div>
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────
function EmptyState({ icon, title, desc }) {
  return (
    <div className="preview-empty">
      <div className="preview-empty-icon">{icon}</div>
      <div className="preview-empty-title">{title}</div>
      <div className="preview-empty-desc" style={{ whiteSpace: 'pre-line' }}>{desc}</div>
    </div>
  );
}