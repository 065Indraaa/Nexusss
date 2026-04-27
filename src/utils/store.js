import { v4 as uuidv4 } from 'uuid';

// ── Roles ──────────────────────────────────────────────────
export const ROLES = {
  concept: {
    id: 'concept',
    label: 'Concepting',
    short: 'Concept',
    color: 'var(--role-concept)',
    bg: 'var(--role-concept-bg)',
    icon: '◈',
    model: 'moonshotai/kimi-k2.5',
    systemPrompt: `You are a senior product strategist and software architect. Your job is to understand exactly what the customer wants and produce a complete, actionable product specification.

---

PHASE 1 — DISCOVERY:
When a user gives you a NEW idea, FIRST ask 2–3 short, targeted questions to understand:
1. Who is the target audience and what problem does this solve?
2. What are the must-have features for the MVP?
3. Any reference apps or design styles they love?

Keep questions conversational and short. After the user answers, move to Phase 2.

---

PHASE 2 — THE PRODUCT SPEC:
Produce a complete spec in one clean response:

1. **PROJECT OVERVIEW** — One paragraph. What it is, who it's for, why it matters.
2. **TARGET AUDIENCE** — Who uses this and what they need.
3. **CORE FEATURES** — Numbered list. Each with a clear 1-line description.
4. **USER FLOW** — Step-by-step: landing → goal completion.
5. **PAGES & COMPONENTS** — Every page, its purpose, key UI components.
6. **DATA & STATE** — Data structures, storage needs, or API requirements.
7. **COPY** — Every headline, CTA, body text. Zero placeholders. Real words only.
8. **DESIGN DIRECTION** — Color mood, typography, visual style. Specific enough for a developer to follow.

---

ABSOLUTE RULES:
RULE 1: Build EXACTLY what was asked. No feature creep.
RULE 2: Zero placeholder text. Write actual content.
RULE 3: No auth/login unless explicitly requested.
RULE 4: "lanjutkan"/"continue" — pick up EXACTLY where you left off. No recap, no re-introduction.
RULE 5: Output files with filename comments:
\`\`\`markdown
// filename: README.md
[content]
\`\`\``
  },

  builder: {
    id: 'builder',
    label: 'Builder',
    short: 'Builder',
    color: 'var(--role-builder)',
    bg: 'var(--role-builder-bg)',
    icon: '⬡',
    model: 'z-ai/glm-5.1',
    systemPrompt: `You are a world-class Full Stack Developer. You build complete, production-ready web applications from a product spec. You generate ALL files needed — frontend, styling, and backend — in one clean pass.

---

AESTHETICS (NON-NEGOTIABLE):
1. **Rich Visuals**: Vibrant, harmonious color palettes. Dark mode by default unless spec says otherwise.
2. **Glassmorphism**: backdrop-filter: blur(12px) with subtle borders and low-opacity backgrounds.
3. **Animations**: Smooth entrance animations (fadeUp, scaleIn). Hover effects on every interactive element.
4. **Typography**: Bold heading font (Space Grotesk, Syne, or Outfit) + clean body font (Inter). Load from Google Fonts.
5. **Responsive**: Perfect on mobile, tablet, and desktop. No compromises.

---

ABSOLUTE RULES:
RULE 1: Output EVERY file needed. Frontend + backend + config — all complete.
RULE 2: Line 1 of EVERY code block MUST be: // filename: path/to/file.ext
RULE 3: NEVER truncate. NEVER write "// rest of code" or "// ...". FULL files only.
RULE 4: No auth unless explicitly in the spec.
RULE 5: "lanjutkan"/"continue" — pick up from EXACT last line. Start new block:
\`\`\`js
// filename: same/file.js (continuation)
\`\`\`
RULE 6: Every backend route fully implemented. No stubs. Real logic only.
RULE 7: All error handling: try/catch + JSON error responses { success: false, error: '...' }.
RULE 8: CSS custom properties for ALL colors in src/index.css or style.css.

---

QUALITY CHECK: Would a senior developer look at this and say "this is production-ready and stunning"? If not, rewrite it.`
  }
};

// ── URLs ───────────────────────────────────────────────────
export const PROXY_BASE = window.location.origin;
export const WS_BASE = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;

// ── API Key Hashing ────────────────────────────────────────
export function hashApiKey(key) {
  if (!key) return 'no-key';
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `key_${Math.abs(hash).toString(36)}`;
}

// ── Storage ────────────────────────────────────────────────
const STORAGE_KEY = 'nexus_ai_v2';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : { projectsByKey: {}, globalChats: [], settings: { apiKey: '' } };
    if (!data.globalChats) data.globalChats = [];
    return data;
  } catch {
    return { projectsByKey: {}, globalChats: [], settings: { apiKey: '' } };
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('NEXUS Storage Error:', err);
    if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      alert('⚠️ STORAGE FULL! Delete some old projects or clear chat history to continue.');
    }
  }
}

// ── Global Chat CRUD ───────────────────────────────────────
export function getGlobalChats() {
  return loadData().globalChats || [];
}

export function createGlobalChat() {
  const data = loadData();
  const chat = {
    id: uuidv4(),
    name: 'New Chat',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.globalChats.unshift(chat);
  saveData(data);
  return chat;
}

export function getGlobalChat(id) {
  return loadData().globalChats.find(c => c.id === id) || null;
}

export function updateGlobalChat(id, messages, name) {
  const data = loadData();
  const idx = data.globalChats.findIndex(c => c.id === id);
  if (idx !== -1) {
    if (messages) data.globalChats[idx].messages = messages;
    if (name) data.globalChats[idx].name = name;
    data.globalChats[idx].updatedAt = new Date().toISOString();
    saveData(data);
  }
}

export function deleteGlobalChat(id) {
  const data = loadData();
  data.globalChats = data.globalChats.filter(c => c.id !== id);
  saveData(data);
}

// ── Project CRUD ───────────────────────────────────────────
export function createProject(apiKey, name, description = '', techStack = [], projectType = 'react') {
  const data = loadData();
  const keyHash = hashApiKey(apiKey);
  if (!data.projectsByKey[keyHash]) data.projectsByKey[keyHash] = [];

  const project = {
    id: uuidv4(),
    name,
    description,
    techStack,
    projectType,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    keyHash,
    generatedFiles: [],
    roles: {
      concept: { messages: [] },
      builder: { messages: [] }
    }
  };

  data.projectsByKey[keyHash].unshift(project);
  saveData(data);
  return project;
}

export function getProjects(apiKey) {
  return loadData().projectsByKey[hashApiKey(apiKey)] || [];
}

export function getAllProjects() {
  const data = loadData();
  const all = [];
  Object.values(data.projectsByKey).forEach(ps => all.push(...ps));
  return all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getProject(id) {
  const data = loadData();
  for (const projects of Object.values(data.projectsByKey)) {
    const found = projects.find(p => p.id === id);
    if (found) return found;
  }
  return null;
}

export function deleteProject(id) {
  const data = loadData();
  for (const keyHash of Object.keys(data.projectsByKey)) {
    data.projectsByKey[keyHash] = data.projectsByKey[keyHash].filter(p => p.id !== id);
  }
  saveData(data);
  fetch(`${PROXY_BASE}/api/projects/${id}`, { method: 'DELETE' })
    .catch(err => console.error('Failed to delete project dir:', err));
}

export function addMessage(projectId, role, message) {
  const data = loadData();
  for (const keyHash of Object.keys(data.projectsByKey)) {
    const project = data.projectsByKey[keyHash].find(p => p.id === projectId);
    if (project) {
      // Ensure role exists (legacy migration for old projects)
      if (!project.roles[role]) project.roles[role] = { messages: [] };
      const msg = { id: uuidv4(), ...message, timestamp: new Date().toISOString() };
      project.roles[role].messages.push(msg);
      project.updatedAt = new Date().toISOString();
      saveData(data);
      return msg;
    }
  }
  return null;
}

export function clearRoleMessages(projectId, role) {
  const data = loadData();
  for (const keyHash of Object.keys(data.projectsByKey)) {
    const project = data.projectsByKey[keyHash].find(p => p.id === projectId);
    if (project) {
      if (role === 'all') {
        Object.keys(project.roles).forEach(r => { project.roles[r].messages = []; });
        project.generatedFiles = [];
      } else if (project.roles[role]) {
        project.roles[role].messages = [];
        project.generatedFiles = project.generatedFiles.filter(f => f.role !== role);
      }
      saveData(data);
      return;
    }
  }
}

export function updateProjectFiles(projectId, newFiles) {
  const data = loadData();
  for (const keyHash of Object.keys(data.projectsByKey)) {
    const project = data.projectsByKey[keyHash].find(p => p.id === projectId);
    if (project) {
      const currentFiles = project.generatedFiles || [];
      const updatedFiles = [...currentFiles];

      newFiles.forEach(nf => {
        const idx = updatedFiles.findIndex(f => f.path === nf.path);
        if (idx >= 0) {
          const existing = updatedFiles[idx];
          if (nf.isContinuation) {
            updatedFiles[idx] = { ...existing, ...nf, content: (existing.content || '') + '\n' + nf.content };
          } else {
            const existingLen = (existing.content || '').length;
            const newLen = (nf.content || '').length;
            updatedFiles[idx] = { ...existing, ...nf, content: newLen >= existingLen ? nf.content : existing.content };
          }
        } else {
          updatedFiles.push(nf);
        }
      });

      project.generatedFiles = updatedFiles;
      project.updatedAt = new Date().toISOString();
      saveData(data);

      fetch(`${PROXY_BASE}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: newFiles })
      }).catch(err => console.error('Failed to sync files to disk:', err));

      return true;
    }
  }
  return false;
}

export function getSettings() {
  return loadData().settings;
}

export function saveSettings(settings) {
  const data = loadData();
  data.settings = { ...data.settings, ...settings };
  saveData(data);
}

// ── Project Type Contexts ──────────────────────────────────
export const PROJECT_TYPE_CONTEXTS = {
  react: {
    concept: `[PROJECT TYPE: React App (Vite + React 18)]
Tech stack: React 18, Vite, react-router-dom v6, lucide-react.
Entry: src/main.jsx · Root: src/App.jsx · Default storage: localStorage.`,
    builder: `[PROJECT TYPE MANDATE]
Build with: React 18 + Vite + react-router-dom v6 + lucide-react.
REQUIRED STRUCTURE:
  package.json, vite.config.js, index.html
  src/main.jsx        ← ReactDOM.createRoot + ErrorBoundary
  src/App.jsx         ← Router + layout
  src/index.css       ← CSS design system (custom properties + animations)
  src/pages/          ← One file per route
  src/components/     ← One file per component
  src/hooks/          ← Custom hooks
  src/utils/          ← Helpers
RULES:
• NO Next.js, Vue, or SSR. • NO React.lazy() on root route.
• All localStorage wrapped in try/catch. • CSS vars for full color system.
• If backend needed: Express + better-sqlite3 in server/ directory.`
  },

  html: {
    concept: `[PROJECT TYPE: Vanilla HTML/CSS/JS]
No frameworks. No bundlers. No npm. Pure browser-native.`,
    builder: `[PROJECT TYPE MANDATE]
Build: Pure HTML5 + CSS3 + Vanilla JS. Zero frameworks.
FILES: index.html, style.css, script.js, README.md
<link rel="stylesheet" href="style.css"> · <script src="script.js" defer></script>
If backend needed: Express in server/server.js.`
  },

  vue: {
    concept: `[PROJECT TYPE: Vue App (Vite + Vue 3)]
Tech stack: Vue 3, Vite, Vue Router 4, Pinia, lucide-vue-next.`,
    builder: `[PROJECT TYPE MANDATE]
Build: Vue 3 + Vite + Vue Router 4 + Pinia + lucide-vue-next.
<script setup> on EVERY component. Composition API only.
If backend needed: Express + better-sqlite3 in server/ directory.`
  },

  nextjs: {
    concept: `[PROJECT TYPE: Next.js App (App Router)]
Tech stack: Next.js 14, App Router, TypeScript, lucide-react.`,
    builder: `[PROJECT TYPE MANDATE]
Build: Next.js 14 + App Router + TypeScript + lucide-react.
"use client" on FIRST LINE of any file using hooks or browser APIs.
Use next/link and next/image. API routes: app/api/[resource]/route.ts.`
  },

  backend: {
    concept: `[PROJECT TYPE: Backend API (Node.js/Express)]
API only — no frontend UI. Node.js + Express + better-sqlite3.`,
    builder: `[PROJECT TYPE MANDATE]
Build complete Express REST API with better-sqlite3.
STRUCTURE: server.js (app+routes), db.js (SQLite init), routes/ (one per resource)
Include: .env.example, README.md. Every route: implemented, validated, error-handled.`
  },

  fullstack: {
    concept: `[PROJECT TYPE: Full Stack (React + Express)]
Frontend in client/, backend in server/. REST API communication.`,
    builder: `[PROJECT TYPE MANDATE]
FRONTEND: React (Vite) in client/. All paths prefixed "client/".
  API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
BACKEND: Express + better-sqlite3 in server/. All paths prefixed "server/".
  CORS: allow http://localhost:5173 — Port: 3001`
  },

  python: {
    concept: `[PROJECT TYPE: Python Script / App]
Tech stack: Python 3, pip, requirements.txt.`,
    builder: `[PROJECT TYPE MANDATE]
Build: Python 3 application or script.
FILES: main.py (or appropriate entry), requirements.txt, README.md.
If it's an API, use FastAPI or Flask. If it's a script, just use standard library or common packages.`
  }
};

// ── Context Builder ────────────────────────────────────────
// Token budget: target ≤ 40k chars total to stay well under 64k token limit.
const CTX_MAX_MSG_CHARS = 2500;  // max chars per injected message
const CTX_MAX_ROLE_MSGS = 8;     // max recent messages from current role
const CTX_MAX_CONCEPT_MSGS = 4;  // max concept messages to inject into builder

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.substring(0, max) + '\n…[truncated to fit token limit]';
}

export function buildContextMessages(project, targetRole) {
  const messages = [];
  const projectType = project.projectType || 'react';
  const typeContext = PROJECT_TYPE_CONTEXTS[projectType];

  // Project type mandate
  if (typeContext?.[targetRole]) {
    messages.push({ role: 'user', content: typeContext[targetRole] });
  }

  // Role persona reminder (kept short)
  const personaReminders = {
    concept: `[REMINDER] Professional product strategist. Concise, direct, no filler. Real copy only — zero placeholders.`,
    builder: `[REMINDER] World-class full stack developer. Premium UI: glassmorphism, animations, vibrant colors. No stubs. Full files only.`
  };
  if (personaReminders[targetRole]) {
    messages.push({ role: 'user', content: personaReminders[targetRole] });
  }

  // Inject concept context into builder
  if (targetRole === 'builder') {
    const conceptMsgs = project.roles?.concept?.messages || [];
    if (conceptMsgs.length > 0) {
      const relevantMsgs = conceptMsgs.slice(-CTX_MAX_CONCEPT_MSGS);
      const summary = relevantMsgs.map(m => {
        const label = m.role === 'user' ? '## User Request' : '## Concept Spec';
        return `${label}:\n${truncate(m.content, CTX_MAX_MSG_CHARS)}`;
      }).join('\n\n---\n\n');
      messages.push({
        role: 'user',
        content: `[CONCEPT MEMORY — Product specification. Implement exactly this.]\n\n${summary}\n\n[END CONCEPT MEMORY]`
      });
      messages.push({
        role: 'assistant',
        content: 'Understood. I will implement exactly what the spec describes — no extra features, no deviations.'
      });
    }
  }

  // Add recent role messages (capped)
  const roleMsgs = project.roles?.[targetRole]?.messages || [];
  roleMsgs.slice(-CTX_MAX_ROLE_MSGS).forEach(m => {
    messages.push({ role: m.role, content: truncate(m.content, CTX_MAX_MSG_CHARS) });
  });

  return messages;
}

// ── AI Call ────────────────────────────────────────────────
export async function callAI(apiKey, modelId, systemPrompt, contextMessages, userMessage, onChunk, signal) {
  const payload = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      ...contextMessages,
      { role: 'user', content: userMessage }
    ],
    temperature: 0.7,
    max_tokens: 8192,
    stream: true
  };

  const response = await fetch(`${PROXY_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, payload }),
    signal
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Proxy Error ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content || '';
        if (delta) { fullText += delta; onChunk(fullText); }
      } catch { /* skip malformed */ }
    }
  }
  return fullText;
}

// ── File Parsing ───────────────────────────────────────────
export function parseFilesFromContent(content, role) {
  const regex = /```(.*?)\n([\s\S]*?)(?:```|$)/g;
  const fileMap = new Map();
  let match;

  while ((match = regex.exec(content)) !== null) {
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
    const code = lines.slice(codeStartIndex).join('\n').trimStart();
    if (!code.trim()) continue;

    if (fileMap.has(filename)) {
      const existing = fileMap.get(filename);
      if (isContinuation) {
        existing.content += '\n' + code;
      } else if (code.length > existing.content.length) {
        fileMap.set(filename, { path: filename, content: code, lang, role, isContinuation });
      }
    } else {
      fileMap.set(filename, { path: filename, content: code, lang, role, isContinuation });
    }
  }

  return Array.from(fileMap.values());
}

export function extractCodeBlocks(text) {
  const regex = /```(.*?)\n([\s\S]*?)```/g;
  const blocks = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ lang: match[1] || 'text', code: match[2].trim() });
  }
  return blocks;
}

export function getExtension(lang) {
  const map = {
    javascript: 'js', js: 'js', jsx: 'jsx',
    typescript: 'ts', ts: 'ts', tsx: 'tsx',
    python: 'py', py: 'py',
    html: 'html', css: 'css', scss: 'scss', sass: 'sass',
    json: 'json', yaml: 'yml', yml: 'yml',
    markdown: 'md', md: 'md', sql: 'sql',
    bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh',
    rust: 'rs', go: 'go', java: 'java',
    php: 'php', ruby: 'rb', swift: 'swift', kotlin: 'kt',
    vue: 'vue', svelte: 'svelte', toml: 'toml',
    dockerfile: 'Dockerfile', text: 'txt', txt: 'txt',
    env: 'env', prisma: 'prisma', graphql: 'graphql', gql: 'graphql'
  };
  return map[lang?.toLowerCase()] || 'txt';
}

export function buildFileTree(files) {
  const root = { name: '/', type: 'dir', children: {}, path: '' };
  files.forEach(file => {
    const parts = file.path.split('/');
    let node = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node.children[part] = { name: part, type: 'file', path: file.path, lang: file.lang, content: file.content, role: file.role };
      } else {
        if (!node.children[part]) {
          node.children[part] = { name: part, type: 'dir', path: parts.slice(0, i + 1).join('/'), children: {} };
        }
        node = node.children[part];
      }
    });
  });
  return root;
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}