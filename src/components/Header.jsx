import React, { useState, useEffect } from 'react';
import { PROXY_BASE } from '../utils/store';

export default function Header({ activeProject, onSettings, onToggleSidebar, sidebarOpen, apiKeySet, onDeleteProject }) {
  const [proxyStatus, setProxyStatus] = useState('checking'); // 'checking' | 'online' | 'offline'

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch(`${PROXY_BASE}/health`, { signal: AbortSignal.timeout(3000) });
        if (mounted) setProxyStatus(res.ok ? 'online' : 'offline');
      } catch {
        if (mounted) setProxyStatus('offline');
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <header className="header">
      <button className="icon-btn" onClick={onToggleSidebar} title="Toggle Sidebar">
        {sidebarOpen ? '☰' : '☰'}
      </button>

      <div className="header-logo">
        <span className="header-logo-icon">⬡</span>
        <span className="header-logo-text">HOG ai AI</span>
      </div>

      {activeProject && (
        <>
          <div className="header-divider" />
          <div className="header-project-name">
            <strong>{activeProject.name}</strong>
            {activeProject.description && ` — ${activeProject.description}`}
          </div>
        </>
      )}

      <div className="header-actions">
        {/* Proxy server status */}
        <div className={`header-api-status ${proxyStatus === 'online' ? 'connected' : ''}`} title={
          proxyStatus === 'checking' ? 'Checking proxy server...' :
          proxyStatus === 'online' ? 'Proxy server online — run: node server.js' :
          'Proxy server offline — run: node server.js'
        }>
          <span className="header-api-dot" style={proxyStatus === 'checking' ? { animation: 'pulse 1s infinite' } : {}} />
          <span>
            {proxyStatus === 'checking' ? 'Checking...' :
             proxyStatus === 'online' ? 'Proxy Online' :
             'Proxy Offline'}
          </span>
        </div>

        {/* NVIDIA API key status */}
        <div className={`header-api-status ${apiKeySet ? 'connected' : ''}`} style={{ marginLeft: 6 }}>
          <span className="header-api-dot" />
          <span>{apiKeySet ? 'NIM Key Set' : 'No API Key'}</span>
        </div>

        {activeProject && (
          <button className="icon-btn" style={{ marginLeft: 8, color: 'var(--error)' }} onClick={onDeleteProject} title="Delete Project">
            🗑
          </button>
        )}

        <button className="icon-btn" onClick={onSettings} title="Settings">
          ⚙
        </button>
      </div>
    </header>
  );
}
