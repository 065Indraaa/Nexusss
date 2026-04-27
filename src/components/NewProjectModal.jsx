// filename: src/components/NewProjectModal.jsx
import React, { useState, useRef } from 'react';

// ─── Preset tech tags shown in the tag picker ───────────────────────────────
const PRESET_STACKS = [
  'React', 'Vue', 'Next.js', 'Nuxt', 'Svelte', 'Angular',
  'Node.js', 'Express', 'FastAPI', 'Django', 'Flask',
  'PostgreSQL', 'MongoDB', 'MySQL', 'Redis', 'Prisma',
  'TypeScript', 'Tailwind CSS', 'GraphQL', 'REST API',
  'Docker', 'JWT Auth', 'Socket.io', 'Stripe'
];

/**
 * PROJECT_TYPES — the source of truth for what the user can select.
 *
 * IMPORTANT: `id` values here MUST match the keys in PROJECT_TYPE_CONTEXTS
 * in constants.js. If you add a new type here, add a matching entry there.
 *
 * id ──────────────────── constants.js key
 * 'react'      →  PROJECT_TYPE_CONTEXTS.react
 * 'html'       →  PROJECT_TYPE_CONTEXTS.html
 * 'vue'        →  PROJECT_TYPE_CONTEXTS.vue
 * 'nextjs'     →  PROJECT_TYPE_CONTEXTS.nextjs
 * 'backend'    →  PROJECT_TYPE_CONTEXTS.backend
 * 'fullstack'  →  PROJECT_TYPE_CONTEXTS.fullstack
 */
const PROJECT_TYPES = [
  {
    id: 'react',
    label: 'React App',
    icon: '⚛',
    desc: 'Vite + React 18 · Component structure · localStorage',
    tech: 'React · Vite · react-router-dom',
    color: '#61dafb'
  },
  {
    id: 'nextjs',
    label: 'Next.js App',
    icon: '▲',
    desc: 'App Router · SSR/SSG · API Routes built in',
    tech: 'Next.js 14 · TypeScript · App Router',
    color: '#e2e8f0'
  },
  {
    id: 'vue',
    label: 'Vue App',
    icon: '◈',
    desc: 'Vite + Vue 3 · Composition API · Pinia',
    tech: 'Vue 3 · Vite · Vue Router · Pinia',
    color: '#42b883'
  },
  {
    id: 'html',
    label: 'HTML / CSS / JS',
    icon: '⬡',
    desc: 'Zero dependencies · Pure browser · No bundler',
    tech: 'HTML5 · CSS3 · Vanilla JS',
    color: '#f16529'
  },
  {
    id: 'backend',
    label: 'Backend API',
    icon: '◉',
    desc: 'REST API · Express · SQLite · No frontend',
    tech: 'Node.js · Express · better-sqlite3',
    color: '#68a063'
  },
  {
    id: 'fullstack',
    label: 'Full Stack',
    icon: '⬡',
    desc: 'React frontend + Express backend · Monorepo',
    tech: 'React · Vite · Express · SQLite',
    color: '#8b5cf6'
  },
  {
    id: 'python',
    label: 'Python App',
    icon: '🐍',
    desc: 'Python scripts or APIs',
    tech: 'Python 3 · requirements.txt',
    color: '#3776ab'
  }
];

// ─── Component ───────────────────────────────────────────────────────────────
export default function NewProjectModal({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [techStack, setTechStack] = useState([]);
  const [projectType, setProjectType] = useState('react');
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef(null);

  // Derive the selected type config for display
  const selectedType = PROJECT_TYPES.find(t => t.id === projectType);

  const addTag = (tag) => {
    const t = tag.trim();
    if (t && !techStack.includes(t)) setTechStack(s => [...s, t]);
    setTagInput('');
  };

  const removeTag = (tag) => setTechStack(s => s.filter(t => t !== tag));

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && techStack.length > 0) {
      setTechStack(s => s.slice(0, -1));
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    // Pass all four fields — projectType is used by buildContextMessages in constants.js
    onCreate(name.trim(), description.trim(), techStack, projectType);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal" style={{ maxWidth: 580 }}>

        {/* ── Header ── */}
        <div className="modal-title">◻ New Project</div>
        <div className="modal-subtitle">
          Choose your stack — the AI agents will align to it automatically.
        </div>

        {/* ── Project Type Grid ── */}
        <div className="form-group">
          <label className="form-label">Project Type</label>
          <div className="project-type-grid">
            {PROJECT_TYPES.map(type => (
              <button
                key={type.id}
                className={`project-type-card ${projectType === type.id ? 'selected' : ''}`}
                onClick={() => setProjectType(type.id)}
                style={{ '--type-color': type.color }}
                title={type.tech}
              >
                <span className="project-type-icon" style={{ color: type.color }}>
                  {type.icon}
                </span>
                <span className="project-type-label">{type.label}</span>
                <span className="project-type-desc">{type.desc}</span>
              </button>
            ))}
          </div>

          {/* Selected type tech-stack pill — subtle info row */}
          {selectedType && (
            <div className="project-type-tech-hint">
              <span className="project-type-tech-dot" style={{ background: selectedType.color }} />
              <span>{selectedType.tech}</span>
            </div>
          )}
        </div>

        {/* ── Project Name ── */}
        <div className="form-group">
          <label className="form-label">Project Name *</label>
          <input
            className="form-input"
            placeholder="e.g. E-Commerce Platform"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        {/* ── Description ── */}
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-input"
            placeholder="Brief description of what you want to build..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            style={{ resize: 'none', minHeight: 60 }}
          />
        </div>

        {/* ── Tech Stack Tags ── */}
        <div className="form-group">
          <label className="form-label">
            Additional Tech Stack{' '}
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
          </label>
          <div
            className="tag-input-row"
            onClick={() => tagInputRef.current?.focus()}
          >
            {techStack.map(tag => (
              <span key={tag} className="tag">
                {tag}
                <button
                  className="tag-remove"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              ref={tagInputRef}
              className="tag-input"
              placeholder={techStack.length === 0 ? 'Type and press Enter…' : ''}
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {PRESET_STACKS
              .filter(t => !techStack.includes(t))
              .slice(0, 12)
              .map(tag => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  className="preset-tag-btn"
                >
                  + {tag}
                </button>
              ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim()}
          >
            Create Project →
          </button>
        </div>

      </div>
    </div>
  );
}