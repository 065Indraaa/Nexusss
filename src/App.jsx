import React, { useState, useEffect, useCallback } from 'react';
import { getProjects, getProject, createProject, deleteProject, getSettings, saveSettings, hashApiKey, getGlobalChats, createGlobalChat } from './utils/store';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import PreviewPanel from './components/PreviewPanel';
import SettingsModal from './components/SettingsModal';
import NewProjectModal from './components/NewProjectModal';
import GlobalChat from './components/GlobalChat';
import './styles/globals.css';
import './styles/app.css';

export default function App() {
  const [projects, setProjects] = useState([]);
  const [globalChats, setGlobalChats] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeGlobalChatId, setActiveGlobalChatId] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [activeRole, setActiveRole] = useState('concept');
  const [viewMode, setViewMode] = useState('project'); // 'project' or 'global-chat'
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [panelWidths, setPanelWidths] = useState({ chat: 42, preview: 58 }); // percentages
  const [isDragging, setIsDragging] = useState(false);
  const [mobileShowPreview, setMobileShowPreview] = useState(false);

  // ── Load initial data ──────────────────────────────────
  useEffect(() => {
    const settings = getSettings();
    const key = settings.apiKey || '';
    setApiKey(key);

    const ps = getProjects(key);
    setProjects(ps);

    const chats = getGlobalChats();
    setGlobalChats(chats);
    if (chats.length === 0) {
      const newChat = createGlobalChat();
      setGlobalChats([newChat]);
      setActiveGlobalChatId(newChat.id);
    } else {
      setActiveGlobalChatId(chats[0].id);
    }

    if (ps.length > 0) {
      setActiveProjectId(ps[0].id);
    }

    if (!key) setShowSettings(true);
  }, []);

  // ── Refresh active project ──────────────────────────────
  useEffect(() => {
    if (activeProjectId) {
      const p = getProject(activeProjectId);
      setActiveProject(p);
    } else {
      setActiveProject(null);
    }
  }, [activeProjectId, refreshTick]);

  const refresh = useCallback(() => {
    const ps = getProjects(apiKey);
    setProjects(ps);
    const chats = getGlobalChats();
    setGlobalChats(chats);
    setRefreshTick(t => t + 1);
  }, [apiKey]);

  const handleSelectProject = useCallback((id) => {
    setActiveProjectId(id);
    setActiveProject(getProject(id));
    setActiveRole('concept');
  }, []);

  const handleCreateProject = useCallback((name, desc, stack, type) => {
    const p = createProject(apiKey, name, desc, stack, type);
    const ps = getProjects(apiKey);
    setProjects(ps);
    setActiveProjectId(p.id);
    setActiveProject(p);
    setActiveRole('concept');
    setViewMode('project');
    setShowNewProject(false);
  }, [apiKey]);

  const handleSettingsSave = useCallback((newKey) => {
    setApiKey(newKey);
    setShowSettings(false);
    // Load projects for this API key
    const ps = getProjects(newKey);
    setProjects(ps);
    if (ps.length > 0) {
      setActiveProjectId(ps[0].id);
    } else {
      setActiveProjectId(null);
      setActiveProject(null);
    }
  }, []);

  const handleFilesGenerated = useCallback((newFiles) => {
    // Refresh so PreviewPanel sees new files
    setRefreshTick(t => t + 1);
  }, []);

  // ── Panel resize drag ──────────────────────────────────
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);

    const startX = e.clientX;
    const startChat = panelWidths.chat;
    const container = document.querySelector('.panels-container');
    const totalWidth = container?.offsetWidth || window.innerWidth;

    const onMove = (moveE) => {
      const dx = moveE.clientX - startX;
      const pctDx = (dx / totalWidth) * 100;
      const newChat = Math.max(25, Math.min(70, startChat + pctDx));
      setPanelWidths({ chat: newChat, preview: 100 - newChat });
    };

    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelWidths]);

  // ── Global Chat Handlers ────────────────────────────────
  const handleNewGlobalChat = useCallback(() => {
    const newChat = createGlobalChat();
    setGlobalChats(getGlobalChats());
    setActiveGlobalChatId(newChat.id);
    setViewMode('global-chat');
  }, []);

  const handleSelectGlobalChat = useCallback((id) => {
    setActiveGlobalChatId(id);
    setViewMode('global-chat');
    if (window.innerWidth <= 768) setSidebarOpen(false);
  }, []);

  return (
    <div className="app-shell">
      <Header
        activeProject={activeProject}
        onSettings={() => setShowSettings(true)}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        sidebarOpen={sidebarOpen}
        apiKeySet={!!apiKey}
        onDeleteProject={() => {
          if (confirm('Delete this project and all its data from local storage AND disk?')) {
            deleteProject(activeProject.id);
            refresh();
          }
        }}
      />

      <div className="app-body">
        <Sidebar
          open={sidebarOpen}
          projects={projects}
          activeProjectId={activeProjectId}
          globalChats={globalChats}
          activeGlobalChatId={activeGlobalChatId}
          onSelect={handleSelectProject}
          onSelectGlobalChat={handleSelectGlobalChat}
          onNewProject={() => setShowNewProject(true)}
          onNewGlobalChat={handleNewGlobalChat}
          onRefresh={refresh}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />

        <main className="main-content">
          {viewMode === 'global-chat' ? (
            <div style={{ height: '100%', width: '100%', display: 'flex', background: 'var(--bg-deep)' }}>
              <GlobalChat apiKey={apiKey} onNeedApiKey={() => setShowSettings(true)} activeGlobalChatId={activeGlobalChatId} onRefreshChats={refresh} />
            </div>
          ) : activeProject ? (
            <div className={`panels-container ${isDragging ? 'dragging' : ''} ${mobileShowPreview ? 'mobile-show-preview' : ''}`}>
              {/* Mobile panel toggle */}
              <button
                className="mobile-panel-toggle"
                style={{ position: 'absolute', top: 8, right: 8, zIndex: 50 }}
                onClick={() => setMobileShowPreview(v => !v)}
              >
                {mobileShowPreview ? '💬 Chat' : '📁 Files'}
              </button>
              {/* Chat Panel */}
              <div className="panel-chat" style={{ width: `${panelWidths.chat}%` }}>
                <ChatPanel
                  key={activeProjectId}
                  project={activeProject}
                  activeRole={activeRole}
                  onRoleChange={setActiveRole}
                  apiKey={apiKey}
                  onMessageSent={refresh}
                  onNeedApiKey={() => setShowSettings(true)}
                  onFilesGenerated={handleFilesGenerated}
                />
              </div>

              {/* Resize Divider */}
              <div
                className="panel-resizer"
                onMouseDown={handleDragStart}
                title="Drag to resize"
              >
                <div className="panel-resizer-handle" />
              </div>

              {/* Preview Panel */}
              <div className="panel-preview" style={{ width: `${panelWidths.preview}%` }}>
                <PreviewPanel
                  key={activeProjectId}
                  project={activeProject}
                  activeRole={activeRole}
                  onUpdateFiles={handleFilesGenerated}
                />
              </div>
            </div>
          ) : (
            <EmptyState
              onNewProject={() => setShowNewProject(true)}
              hasApiKey={!!apiKey}
              onSettings={() => setShowSettings(true)}
            />
          )}
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          currentKey={apiKey}
          onSave={handleSettingsSave}
          onClose={() => setShowSettings(false)}
          onClearData={refresh}
        />
      )}

      {showNewProject && (
        <NewProjectModal
          onCreate={handleCreateProject}
          onClose={() => setShowNewProject(false)}
        />
      )}
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────
function EmptyState({ onNewProject, hasApiKey, onSettings }) {
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <div className="empty-logo">
          <span className="empty-logo-icon">⬡</span>
          <span className="empty-logo-text">HOG ai</span>
        </div>
        <p className="empty-tagline">Multi-Role AI Development Platform</p>
        <p className="empty-sub">Chat on the left • Files, Preview & Terminal on the right</p>

        <div className="empty-roles">
          <div className="empty-role" style={{ '--role-color': 'var(--role-concept)' }}>
            <span>◈</span><span>Concepting</span>
          </div>
          <div className="empty-arrow">→</div>
          <div className="empty-role" style={{ '--role-color': 'var(--role-frontend)' }}>
            <span>◇</span><span>Frontend</span>
          </div>
          <div className="empty-arrow">→</div>
          <div className="empty-role" style={{ '--role-color': 'var(--role-backend)' }}>
            <span>◉</span><span>Backend</span>
          </div>
        </div>

        <div className="empty-features">
          <div className="empty-feature">
            <span className="empty-feature-icon">📁</span>
            <span>Full file structure generated</span>
          </div>
          <div className="empty-feature">
            <span className="empty-feature-icon">🌐</span>
            <span>Live HTML preview</span>
          </div>
          <div className="empty-feature">
            <span className="empty-feature-icon">⚡</span>
            <span>Integrated terminal</span>
          </div>
          <div className="empty-feature">
            <span className="empty-feature-icon">🔑</span>
            <span>Projects saved per API key</span>
          </div>
        </div>

        {!hasApiKey && (
          <button className="btn btn-ghost empty-api-btn" onClick={onSettings}>
            ⚙ Set NVIDIA API Key to get started
          </button>
        )}
        <button className="btn btn-primary" onClick={onNewProject}>
          + Create New Project
        </button>
      </div>
    </div>
  );
}
