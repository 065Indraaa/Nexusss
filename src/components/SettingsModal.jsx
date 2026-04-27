import React, { useState } from 'react';
import { saveSettings, getProjects, deleteProject, ROLES, hashApiKey } from '../utils/store';

export default function SettingsModal({ currentKey, onSave, onClose, onClearData }) {
  const [apiKey, setApiKey] = useState(currentKey || '');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const keyHash = apiKey ? hashApiKey(apiKey) : null;
  const projectsForKey = apiKey ? getProjects(apiKey) : [];
  const isNewKey = apiKey && apiKey !== currentKey;

  const handleSave = () => {
    setSaving(true);
    saveSettings({ apiKey });
    setTimeout(() => {
      setSaving(false);
      onSave(apiKey);
    }, 200);
  };

  const handleClearAll = () => {
    if (confirm('This will delete ALL projects and conversations for ALL API keys. Are you sure?')) {
      const all = getProjects('');
      // delete all keys from localStorage by clearing projectsByKey
      const key = apiKey || currentKey;
      const projects = getProjects(key);
      projects.forEach(p => deleteProject(p.id));
      onClearData();
      onClose();
    }
  };

  const handleClearCurrentKey = () => {
    if (!apiKey) return;
    const projects = getProjects(apiKey);
    if (projects.length === 0) { alert('No projects for this API key.'); return; }
    if (confirm(`Delete all ${projects.length} project(s) for this API key?`)) {
      projects.forEach(p => deleteProject(p.id));
      onClearData();
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-title">⚙ Settings</div>
        <div className="modal-subtitle">Configure your NVIDIA NIM API connection.</div>

        {/* API Key */}
        <div className="settings-section">
          <div className="settings-section-title">NVIDIA NIM API Key</div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                className="form-input form-input-mono"
                placeholder="nvapi-xxxxxxxxxxxxxxxxxxxx"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{ paddingRight: 80 }}
              />
              <button
                onClick={() => setShowKey(s => !s)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                  fontSize: 11, fontFamily: 'var(--font-mono)'
                }}
              >
                {showKey ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </div>

          {/* Key status card */}
          {apiKey && (
            <div className="api-key-status-card">
              <div className="api-key-status-row">
                <span className="api-key-hash">Key ID: {keyHash?.slice(0, 12)}...</span>
                {isNewKey ? (
                  <span className="api-key-badge new">New Key</span>
                ) : (
                  <span className="api-key-badge active">Active</span>
                )}
              </div>
              <div className="api-key-projects-count">
                {isNewKey
                  ? `New workspace will be created for this key`
                  : `${projectsForKey.length} project${projectsForKey.length !== 1 ? 's' : ''} stored for this key`}
              </div>
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
            Get your key at{' '}
            <a href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>
              build.nvidia.com
            </a>{' '}→ Sign in → Get API Key
          </div>
        </div>

        {/* How it works */}
        <div className="settings-section">
          <div className="settings-section-title">How API Key Isolation Works</div>
          <div className="settings-info-grid">
            <div className="settings-info-item">
              <span className="settings-info-icon">🔑</span>
              <div>
                <div className="settings-info-title">Per-Key Projects</div>
                <div className="settings-info-desc">Each API key has its own isolated set of projects</div>
              </div>
            </div>
            <div className="settings-info-item">
              <span className="settings-info-icon">♻</span>
              <div>
                <div className="settings-info-title">Auto Reload</div>
                <div className="settings-info-desc">Same key = same projects automatically restored</div>
              </div>
            </div>
            <div className="settings-info-item">
              <span className="settings-info-icon">🔒</span>
              <div>
                <div className="settings-info-title">Local Storage</div>
                <div className="settings-info-desc">All data stored in your browser — never sent to us</div>
              </div>
            </div>
          </div>
        </div>

        {/* Models per role */}
        <div className="settings-section">
          <div className="settings-section-title">AI Models Per Role</div>
          {Object.values(ROLES).map(role => (
            <div key={role.id} className="role-model-row">
              <div className="role-model-label" style={{ color: role.color }}>
                {role.icon} {role.short}
              </div>
              <div className="role-model-value" title={role.model}>{role.model}</div>
            </div>
          ))}
        </div>

        {/* Data Management */}
        <div className="settings-section">
          <div className="settings-section-title">Data Management</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {apiKey && projectsForKey.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={handleClearCurrentKey}>
                🗑 Clear Current Key's Projects ({projectsForKey.length})
              </button>
            )}
            <button className="btn btn-danger btn-sm" onClick={handleClearAll}>
              ⚠ Delete All Data
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
