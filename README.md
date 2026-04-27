# ⬡ NEXUS AI — Multi-Role Dev Platform

Dark futuristic AI coding assistant with 3 interconnected agents: **Concepting**, **Frontend**, **Backend**.

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## 🔑 API Key Setup

1. Go to [build.nvidia.com](https://build.nvidia.com)
2. Sign in / Register
3. Click **Get API Key** on any model
4. Copy the `nvapi-...` key
5. Paste it in NEXUS AI Settings (⚙)

## 📦 Models Used

| Role | Model | Why |
|------|-------|-----|
| **Concepting** | `meta/llama-3.3-70b-instruct` | Best reasoning & creativity for design specs |
| **Frontend** | `mistralai/devstral-2-123b-instruct-2512` | Largest dedicated coding model by Mistral |
| **Backend** | `deepseek-ai/deepseek-v3.2` | Best logic, API design, and backend patterns |

## 🌐 Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Or connect your GitHub repo to Vercel — `vercel.json` is pre-configured.

## 🗂 Project Structure

```
nexus-ai/
├── src/
│   ├── components/
│   │   ├── Header.jsx         # Top bar
│   │   ├── Sidebar.jsx        # Project list
│   │   ├── ChatPanel.jsx      # Main chat with role tabs
│   │   ├── Message.jsx        # Message + code blocks
│   │   ├── SettingsModal.jsx  # API key & settings
│   │   └── NewProjectModal.jsx
│   ├── utils/
│   │   └── store.js           # localStorage + NVIDIA API
│   ├── styles/
│   │   ├── globals.css        # CSS variables + base
│   │   └── app.css            # Component styles
│   ├── App.jsx
│   └── main.jsx
├── public/
│   └── nexus-icon.svg
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

## ✨ Features

- **3 Interconnected Agents** — Concept → Frontend → Backend memory flow
- **Streaming responses** — Real-time token streaming from NVIDIA NIM
- **Auto-retry** — Up to 3 retries with exponential backoff
- **Syntax highlighting** — 100+ languages via Prism
- **Code download** — Download any code block as file
- **Stop generation** — Cancel mid-stream
- **Project memory** — All conversations saved in localStorage
- **Context injection** — Backend reads Frontend reads Concept automatically

## 🎨 Design

Dark futuristic theme inspired by Vercel + Linear.
- JetBrains Mono (headings)
- Inter (body)
- Fira Code (code blocks)
