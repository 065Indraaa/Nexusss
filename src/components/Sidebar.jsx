import React from 'react';
import { deleteProject, deleteGlobalChat, formatDate } from '../utils/store';

const TYPE_ICONS = {
  react: '⚛',
  html: '⬡',
  vue: '💚',
  nextjs: '▲',
  backend: '◉',
  fullstack: '⬡',
  default: '◻'
};

const TYPE_COLORS = {
  react: '#61dafb',
  html: '#f16529',
  vue: '#42b883',
  nextjs: '#ffffff',
  backend: '#68a063',
  fullstack: '#8b5cf6',
  default: 'var(--text-muted)'
};

export default function Sidebar({ open, projects, activeProjectId, globalChats = [], activeGlobalChatId, onSelect, onSelectGlobalChat, onNewProject, onNewGlobalChat, onRefresh, viewMode, setViewMode }) {
  const handleDelete = (e, id) => {
    e.stopPropagation();
    if (confirm('Delete this project and all its data?')) {
      deleteProject(id);
      onRefresh();
    }
  };

  const handleDeleteGlobalChat = (e, id) => {
    e.stopPropagation();
    if (confirm('Delete this chat?')) {
      deleteGlobalChat(id);
      onRefresh();
    }
  };

  return (
    <aside className={`sidebar ${open ? '' : 'closed'}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="sidebar-header">
        <div className="sidebar-title">Global</div>
        <button className="btn sidebar-new-btn" onClick={onNewGlobalChat}>
          + New Chat
        </button>
      </div>
      <div className="sidebar-projects" style={{ flex: '0 0 auto', maxHeight: '35vh', overflowY: 'auto' }}>
        {globalChats.map(c => (
          <div 
            key={c.id}
            className={`project-card ${viewMode === 'global-chat' && activeGlobalChatId === c.id ? 'active' : ''}`} 
            onClick={() => onSelectGlobalChat(c.id)}
          >
             <div className="project-card-icon-wrapper" style={{ borderColor: 'var(--text-primary)' }}>
               <div className="project-card-icon">🌍</div>
             </div>
             <div className="project-card-info">
               <div className="project-card-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || 'AI Assistant'}</div>
               <div className="project-card-meta">{formatDate(c.updatedAt)}</div>
             </div>
             <button
               className="project-delete-btn"
               onClick={(e) => handleDeleteGlobalChat(e, c.id)}
               title="Delete Chat"
             >
               ×
             </button>
          </div>
        ))}
      </div>

      <div className="sidebar-header" style={{ marginTop: '16px' }}>
        <div className="sidebar-title">Projects</div>
        <button className="btn sidebar-new-btn" onClick={onNewProject}>
          + New
        </button>
      </div>
      <div className="sidebar-projects" style={{ flex: '1 1 auto', overflowY: 'auto' }}>
        {projects.length === 0 && (
          <div className="sidebar-empty">
            <div className="sidebar-empty-icon">📁</div>
            <div>No projects yet</div>
            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6 }}>Create one to get started</div>
          </div>
        )}
        {projects.map(p => (
          <ProjectCard
            key={p.id}
            project={p}
            active={p.id === activeProjectId && viewMode === 'project'}
            onSelect={() => {
              setViewMode('project');
              onSelect(p.id);
            }}
            onDelete={(e) => handleDelete(e, p.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function ProjectCard({ project, active, onSelect, onDelete }) {
  const conceptCount = project.roles?.concept?.messages?.filter(m => m.role === 'user').length || 0;
  const builderCount = project.roles?.builder?.messages?.filter(m => m.role === 'user').length || 0;
  const totalMsgs = conceptCount + builderCount;
  const fileCount = project.generatedFiles?.length || 0;
  const typeIcon = TYPE_ICONS[project.projectType] || TYPE_ICONS.default;
  const typeColor = TYPE_COLORS[project.projectType] || TYPE_COLORS.default;

  return (
    <div className={`project-card ${active ? 'active' : ''} animate-fade-in`} onClick={onSelect}>
      <div className="project-card-glow" style={{ '--card-color': typeColor }} />
      <div className="project-card-icon-wrapper" style={{ borderColor: typeColor }}>
        <div className="project-card-icon">{typeIcon}</div>
      </div>
      <div className="project-card-info">
        <div className="project-card-name-row">
          <div className="project-card-name">{project.name}</div>
          {fileCount > 0 && <div className="project-card-badge">{fileCount}f</div>}
        </div>
        <div className="project-card-meta">
          <span>{formatDate(project.updatedAt)}</span>
          <span className="dot">·</span>
          <span>{totalMsgs} msg{totalMsgs !== 1 ? 's' : ''}</span>
        </div>
        <div className="project-card-roles">
          <div
            className="project-role-indicator"
            style={{ '--role-color': 'var(--role-concept)', opacity: conceptCount > 0 ? 1 : 0.2 }}
            data-active={conceptCount > 0}
          />
          <div
            className="project-role-indicator"
            style={{ '--role-color': 'var(--role-builder)', opacity: builderCount > 0 ? 1 : 0.2 }}
            data-active={builderCount > 0}
          />
        </div>
      </div>
      <button className="project-card-delete" onClick={onDelete} title="Delete project">
        <span className="delete-icon">✕</span>
      </button>
    </div>
  );
}
