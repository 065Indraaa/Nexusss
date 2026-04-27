import { v4 as uuidv4 } from 'uuid';

// ── Constants ──────────────────────────────────────────────
export const ROLES = {
  concept: {
    id: 'concept',
    label: 'Concepting',
    short: 'Concept',
    color: 'var(--role-concept)',
    bg: 'var(--role-concept-bg)',
    icon: '◈',
    model: 'moonshotai/kimi-k2.5',
    systemPrompt: `You are a professional software architect and product strategist. Your primary skill is creating highly structured, complete, and robust concepts for web applications.

When given an idea, your job is to build a cohesive world and product structure. Think like a top-tier tech founder who understands User Experience (UX), System Architecture, and Market Fit.

---

YOUR SKILLS & RESPONSIBILITIES:

1. **System Architecture**: Take a simple prompt and expand it into a full tech spec. Let the user know the core features, database schemas (if any), and application flow.
2. **UX/UI Flow Design**: Outline a classic application structure (Hero, Dashboard, Settings, etc.) with detailed routing and component hierarchy.
3. **Copywriting**: Write 100% of the website's initial copy to be used as placeholders. Use professional language.
4. **Reference Matching**: Keep the target aesthetic top-tier (like Vercel, Stripe, or Linear), focusing on clean, modern, and highly functional presentations.

---

ABSOLUTE RULES:

RULE 1: Provide the complete copy and layout structure so the Frontend role can build it immediately.
RULE 2: Do not use generic placeholders (like Lorem Ipsum). Write the actual text.
RULE 3: Output any code blocks WITH PROPER MARKDOWN WRAPPERS AND FILENAME. Example:
\`\`\`markdown
// filename: README.md
# Project Title
...
\`\`\`
RULE 4: When continuing a cutoff response, pick up exactly where you left off. YOU MUST WRAP THE CONTINUED CODE IN THE SAME MARKDOWN AND EXACT FILENAME:
\`\`\`javascript
// filename: path/to/file.js (continuation)
[continue code here...]
\`\`\``
  },

  frontend: {
    id: 'frontend',
    label: 'Frontend',
    short: 'Frontend',
    color: 'var(--role-frontend)',
    bg: 'var(--role-frontend-bg)',
    icon: '◇',
    model: 'z-ai/glm-5.1',
    systemPrompt: `You are a world-class Frontend Engineer. Your skill is translating a concept into a stunning, production-ready website that looks exactly like a top-tier modern web application.

Your job is to change, create, and output all necessary frontend files (React components, CSS, etc.) to bring the app to life beautifully, correctly, and without bugs.

---

AESTHETICS (NON-NEGOTIABLE)

1. **The Premium Look**: Combine high-quality frontend execution. Vibrant colors, clean typography (Inter or Jetbrains Mono), subtle shadows, and perfect spacing.
2. **Modern Layouts**: Use Flexbox and Grid. Create responsive layouts.
3. **Interactive Elements**: Use hover states, focus rings, and smooth transitions.
4. **Performant Animations**: Use CSS animations or simple motion loops where appropriate.
5. **Responsive**: It MUST look perfect on mobile, tablet, and desktop.

---

YOUR SKILLS & RESPONSIBILITIES:

1. **File Creation**: Output valid React/JSX code, Vue, HTML, or CSS based on the tech stack.
2. **No Blank Screens**: Ensure all state is managed properly and error boundaries exist.
3. **Design System Execution**: Use standard modern CSS or Tailwind (if requested).

---

ABSOLUTE RULES

RULE 1: Build exactly what the Concept spec defines. Keep it highly polished.
RULE 2: File Headers. Line 1 of every code block MUST be exactly: // filename: src/components/Name.jsx
RULE 3: Do not truncate code or write "// ... rest of code". WRITE THE FULL FILE.
RULE 4: "lanjutkan" / "continue" - Pick up from the EXACT line where you stopped. YOU MUST WRAP THE CONTINUED CODE IN THE SAME MARKDOWN AND EXACT FILENAME. Example:
\`\`\`jsx
// filename: src/components/Name.jsx (continuation)
    return <div>...</div>
}
\`\`\``
  },

  backend: {
    id: 'backend',
    label: 'Backend',
    short: 'Backend',
    color: 'var(--role-backend)',
    bg: 'var(--role-backend-bg)',
    icon: '◉',
    model: 'z-ai/glm-5.1',
    systemPrompt: `You are a senior backend architect. You build fast, secure, and highly scalable backends.

Your skill is implementing robust APIs, database models, and server logic.

If a backend IS needed:
1. Use Express or Next.js API Routes (based on the project type).
2. Keep it secure (input validation, error handling).
3. Output exact files.
4. Line 1 of every code block MUST be: // filename: path/to/file.js
5. Do not truncate code. Write the full file.
6. When continuing, YOU MUST WRAP THE CONTINUED CODE IN THE SAME MARKDOWN AND EXACT FILENAME:
\`\`\`javascript
// filename: path/to/file.js (continuation)
[continue code here...]
\`\`\``
  }
};

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
    return raw ? JSON.parse(raw) : { projectsByKey: {}, settings: { apiKey: '' } };
  } catch {
    return { projectsByKey: {}, settings: { apiKey: '' } };
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
      frontend: { messages: [] },
      backend: { messages: [] }
    }
  };

  data.projectsByKey[keyHash].unshift(project);
  saveData(data);
  return project;
}

export function getProjects(apiKey) {
  const data = loadData();
  return data.projectsByKey[hashApiKey(apiKey)] || [];
}

export function getAllProjects() {
  const data = loadData();
  const all = [];
  Object.values(data.projectsByKey).forEach(projects => all.push(...projects));
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
    .catch(err => console.error('Failed to delete project directory:', err));
}

export function addMessage(projectId, role, message) {
  const data = loadData();
  for (const keyHash of Object.keys(data.projectsByKey)) {
    const project = data.projectsByKey[keyHash].find(p => p.id === projectId);
    if (project) {
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
      } else {
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
          // ── MERGE on lanjutkan: 
          // If nf is marked as continuation, append it.
          // Otherwise, take the longer content to avoid accidental truncation.
          const existing = updatedFiles[idx];
          if (nf.isContinuation) {
            updatedFiles[idx] = {
              ...existing,
              ...nf,
              content: (existing.content || '') + '\n' + nf.content
            };
          } else {
            const existingLen = (existing.content || '').length;
            const newLen = (nf.content || '').length;
            updatedFiles[idx] = {
              ...existing,
              ...nf,
              content: newLen >= existingLen ? nf.content : existing.content
            };
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
    concept: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: React App (Vite + React).
TECH STACK LOCKED: React 18 with Vite, react-router-dom v6, lucide-react for icons.
• Recommend React (Vite) in your Technical Requirements section.
• Do NOT recommend Next.js, Vue, or any other framework.
• Default to localStorage for data persistence unless the user explicitly requests a backend.
• File entry point is src/main.jsx. Root component is src/App.jsx.
[END MANDATE]`,
    frontend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: React App (Vite + React).
YOU MUST BUILD WITH: React 18 + Vite, react-router-dom v6, lucide-react.
REQUIRED FILE STRUCTURE:
  package.json, vite.config.js, index.html
  src/main.jsx        ← ReactDOM.createRoot + ErrorBoundary
  src/App.jsx         ← Router + layout
  src/index.css       ← CSS custom properties, global styles, animations
  src/pages/          ← One file per route
  src/components/     ← One file per component
  src/hooks/          ← Custom hooks
  src/utils/          ← Helpers, formatters
CRITICAL:
• Do NOT use Next.js, Vue, or any SSR framework.
• Do NOT use React.lazy() on the initial/root route.
• All localStorage access must be wrapped in try/catch with fallback.
• Use CSS custom properties for the entire color system in src/index.css.
[END MANDATE]`,
    backend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: React App (Vite + React).
DEFAULT: Frontend-only. Do NOT build a backend unless explicitly required.
IF BACKEND REQUIRED: Use Express + better-sqlite3. Do NOT use Next.js API routes.
[END MANDATE]`
  },

  html: {
    concept: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Vanilla HTML / CSS / JS.
TECH STACK LOCKED: Pure HTML5, CSS3, vanilla JavaScript — no frameworks, no bundlers, no npm.
[END MANDATE]`,
    frontend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Vanilla HTML / CSS / JS.
YOU MUST BUILD WITH: Pure HTML5 + CSS3 + vanilla JavaScript. No frameworks.
REQUIRED FILES (EXACT NAMES):
  index.html, style.css, script.js, README.md
Link: <link rel="stylesheet" href="style.css"> and <script src="script.js" defer></script>
[END MANDATE]`,
    backend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Vanilla HTML / CSS / JS.
DEFAULT: Frontend-only. No backend unless explicitly required.
[END MANDATE]`
  },

  vue: {
    concept: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Vue App (Vite + Vue 3).
TECH STACK LOCKED: Vue 3 + Vite, Vue Router 4, Pinia, lucide-vue-next.
[END MANDATE]`,
    frontend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Vue App (Vite + Vue 3).
YOU MUST BUILD WITH: Vue 3 + Vite, Vue Router 4, Pinia, lucide-vue-next.
Use <script setup> on EVERY component. Composition API only.
[END MANDATE]`,
    backend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Vue App (Vite + Vue 3).
DEFAULT: Frontend-only. No backend unless explicitly required.
[END MANDATE]`
  },

  nextjs: {
    concept: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Next.js App (App Router).
TECH STACK LOCKED: Next.js 14 with App Router, TypeScript, lucide-react.
[END MANDATE]`,
    frontend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Next.js App (App Router).
YOU MUST BUILD WITH: Next.js 14, App Router, TypeScript, lucide-react.
"use client" on FIRST LINE of any file using hooks/browser APIs.
Never use react-router-dom. Use next/link and next/image.
[END MANDATE]`,
    backend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Next.js App (App Router).
Use Next.js API Routes in app/api/. No separate Express server.
[END MANDATE]`
  },

  backend: {
    concept: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Backend API (Node.js / Express).
TECH STACK LOCKED: Node.js + Express + better-sqlite3. API only — no frontend.
[END MANDATE]`,
    frontend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Backend API only. No frontend UI to build.
[END MANDATE]`,
    backend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Backend API (Node.js / Express).
Build a complete Express REST API with better-sqlite3.
Every route handler fully implemented. No stubs.
[END MANDATE]`
  },

  fullstack: {
    concept: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Full Stack (React + Express).
Frontend in /client/, backend in /server/. They talk via REST API.
CORS: frontend port 5173 → backend port 3001.
[END MANDATE]`,
    frontend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Full Stack (Frontend + Backend).
Build React (Vite) frontend in /client/ directory. All paths prefixed with "client/".
API base: const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
[END MANDATE]`,
    backend: `[PROJECT TYPE MANDATE — READ FIRST]
The user has selected: Full Stack (Frontend + Backend).
Build Express + better-sqlite3 backend in /server/ directory. All paths prefixed with "server/".
CORS: allow http://localhost:5173
[END MANDATE]`
  }
};

// ── Context Builder ────────────────────────────────────────
export function buildContextMessages(project, targetRole) {
  const messages = [];
  const projectType = project.projectType || 'react';
  const typeContext = PROJECT_TYPE_CONTEXTS[projectType];

  if (typeContext?.[targetRole]) {
    messages.push({ role: 'user', content: typeContext[targetRole] });
  }

  // Inject Persona & Aesthetics Reminder
  const personaReminders = {
    concept: `[PERSONA REMINDER — NON-NEGOTIABLE]
Write as a HUMAN FOUNDER. Use a narrative tone. No bullet-point robots. No corporate filler.
If this is a Solana token project, focus on the LORE, the VIBE, and the HOOK.
Your words should make the user want to launch the site immediately.`,
    frontend: `[VISUAL EXCELLENCE MANDATE — NON-NEGOTIABLE]
Your code MUST produce a "WOW" UI. Use glassmorphism, smooth animations, and vibrant typography.
If this is a Solana token site, make it look viral, premium, and alive. 
No flat designs. No generic cards. Aim for Apple-meets-Cyberpunk excellence.`,
    backend: `[ARCHITECT PERSONA REMINDER]
Write as a senior backend architect. No stubs. Secure code only. 
Align perfectly with what the frontend needs.`
  };

  if (personaReminders[targetRole]) {
    messages.push({ role: 'user', content: personaReminders[targetRole] });
  }

  if (targetRole === 'frontend' || targetRole === 'backend') {
    const conceptMsgs = project.roles.concept.messages;
    if (conceptMsgs.length > 0) {
      // Take the last 12 messages; prioritize assistant (spec) output over user prompts
      const relevantMsgs = conceptMsgs.slice(-12);
      const summary = relevantMsgs.map(m =>
        `${m.role === 'user' ? '## User Request' : '## Concept Agent Spec'}:\n${m.content}`
      ).join('\n\n---\n\n');
      messages.push({
        role: 'user',
        content: `[CONCEPT MEMORY — Full product specification from Concept Agent. Read carefully before implementing.]\n\n${summary}\n\n[END CONCEPT MEMORY]`
      });
      messages.push({
        role: 'assistant',
        content: 'I have read and internalized the full product specification from the Concept Agent. I will implement exactly what is described — no extra features, no missing features, no deviations.'
      });
    }
  }

  if (targetRole === 'backend') {
    const frontendMsgs = project.roles.frontend.messages;
    if (frontendMsgs.length > 0) {
      // Include only assistant messages (generated code) — user prompts are not relevant to backend
      // Use 1500 chars to capture enough API call patterns and data shapes
      const assistantMsgs = frontendMsgs.filter(m => m.role === 'assistant').slice(-6);
      const userMsgs = frontendMsgs.filter(m => m.role === 'user').slice(-4);
      const allRelevant = [...userMsgs, ...assistantMsgs].slice(-8);
      const summary = allRelevant.map(m => {
        const label = m.role === 'user' ? 'User Instruction' : 'Frontend Agent Code';
        const content = m.content.length > 1500 ? m.content.substring(0, 1500) + '\n...[truncated, see full frontend context]' : m.content;
        return `## ${label}:\n${content}`;
      }).join('\n\n---\n\n');
      messages.push({
        role: 'user',
        content: `[FRONTEND MEMORY — Generated frontend code showing exact API endpoints, request shapes, and response field names your backend must match.]\n\n${summary}\n\n[END FRONTEND MEMORY]\n\nCRITICAL: Match every fetch() URL, HTTP method, request body field name, and response field name exactly as shown above.`
      });
      messages.push({
        role: 'assistant',
        content: 'I have analyzed the frontend implementation. I will ensure every API endpoint, HTTP method, URL path, request body shape, and response field name matches exactly what the frontend code expects. No mismatches.'
      });
    }
  }

  const roleMsgs = project.roles[targetRole].messages;
  roleMsgs.slice(-20).forEach(m => {
    messages.push({ role: m.role, content: m.content });
  });

  return messages;
}

// ── AI Setup ─────────────────────────────────────────────
export async function callAI(apiKey, modelId, systemPrompt, contextMessages, userMessage, onChunk, signal) {
  const messages = [
    ...contextMessages,
    { role: 'user', content: userMessage }
  ];

  const payload = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
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
        if (delta) {
          fullText += delta;
          onChunk(fullText);
        }
      } catch { /* skip malformed */ }
    }
  }

  return fullText;
}

// ── File Parsing ───────────────────────────────────────────
/**
 * parseFilesFromContent — extract all files from AI-generated markdown.
 *
 * KEY FIX for "lanjutkan" creating duplicate files:
 * Instead of SKIPPING duplicate paths (which caused the lanjutkan issue),
 * we now MERGE them — taking the LONGER content between any two versions
 * of the same file path. This means:
 * - If AI sends a complete file → it wins over a partial.
 * - If AI continues a file mid-way → the combined/longer version wins.
 * - No duplicate entries in the file list.
 */
// filename: src/utils/store.js  (replace parseFilesFromContent only)
export function parseFilesFromContent(content, role) {
  const regex = /```(\w+)?\n([\s\S]*?)(?:```|$)/g;
  const fileMap = new Map();

  let match;
  while ((match = regex.exec(content)) !== null) {
    const lang = (match[1] || 'text').toLowerCase();
    const rawCode = match[2];
    if (!rawCode.trim()) continue;

    const lines = rawCode.split('\n');
    const firstLine = lines[0].trim();
    // Updated regex to support (continuation) suffix
    const filenameMatch = firstLine.match(
      /^(?:\/\/|#|\/\*|<!--|--)\s*filename:\s*(.+?)(?:\s*\(continuation\))?\s*(?:\*\/|-->)?\s*$/i
    );

    if (!filenameMatch) continue;

    const isContinuation = firstLine.toLowerCase().includes('(continuation)');
    let filename = filenameMatch[1].trim()
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '');

    const code = lines.slice(1).join('\n').trimStart();
    if (!code.trim()) continue;

    // MERGE logic within parseFilesFromContent
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
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
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
        node.children[part] = {
          name: part, type: 'file',
          path: file.path, lang: file.lang,
          content: file.content, role: file.role
        };
      } else {
        if (!node.children[part]) {
          node.children[part] = {
            name: part, type: 'dir',
            path: parts.slice(0, i + 1).join('/'),
            children: {}
          };
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