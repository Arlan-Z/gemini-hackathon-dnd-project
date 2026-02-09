# I Have No Mouth but I Must Scream — AI Horror DnD

![Backend Deploy](https://github.com/Arlan-Z/gemini-hackathon-dnd-project/actions/workflows/backend-deploy.yml/badge.svg)
![Frontend Deploy](https://github.com/Arlan-Z/gemini-hackathon-dnd-project/actions/workflows/front-deploy.yml/badge.svg)

**Overview**
This project is an interactive horror narrative game inspired by “I Have No Mouth, and I Must Scream.” The player makes choices; the AI Dungeon Master (AM) responds with story text, consequences, and scene visuals. The game tracks stats, inventory, tags, locations, and ends the session when sanity or HP collapses.

**Core Features**
- AI-driven story generation with strict structured output and function-calling tool execution for game state changes.
- Stats system (HP, Sanity, Strength, Intelligence, Dexterity) with optional stat checks tied to choices.
- Inventory tracking with add/remove tools and optional story-driven item usage.
- Image generation per scene with cached storage support.
- Router & solvers layer that classifies player intent to bias consequences.
- Context cache for prompt reuse to reduce token cost when supported.

**Architecture**
- Backend: Node.js + Express. Central orchestrator coordinates tool calls, validates structured output, and updates state. Tools apply mutations (stats, inventory, tags, game over, image prompt). State is stored in memory per `sessionId`.
- Frontend: Vue 3 + Pinia. CRT-style UI, typing effect, loading animation, and panels for stats, story, inventory, and actions.

**Setup**
- Backend env vars: see `backend/.env.example`.
- Frontend env vars: see `frontend/.env.example`.

**Evaluation (Hackathon Criteria)**
Quality application development:
- The backend separates orchestration, tool execution, schema validation, and state management into clear modules.
- Strict JSON output parsing + fallback re-asks reduce malformed responses.
- Built-in rate-limit handling and optional caching for prompts and images.
- Codebase is functional but currently lacks automated tests; reliability depends on external model APIs.

Google Gemini 3 usage:
- No. The backend is configured for Gemini 2.x (e.g., `gemini-2.5-flash`) and Imagen for images, with optional Vertex AI support. Models are configurable via env vars.

Code quality and functionality:
- The code is structured, typed, and uses validation (Zod) for inputs and AI outputs.
- Functionality depends on valid API keys and service availability; runtime behavior is expected to be stable once configured.

Real-world impact and market utility:
- Broad market appeal is moderate: it targets interactive fiction and horror RPG fans.
- Practical impact is entertainment-focused rather than mission-critical, but it demonstrates a reusable pattern for AI-driven narrative systems.

Problem significance and efficiency:
- It addresses the challenge of consistent, controllable AI storytelling by combining tool calls, state validation, and strict output schemas.
- This approach improves reliability over pure freeform text generation.

Novelty and originality:
- The AM horror framing plus router-based intent analysis and structured tools create a distinct narrative experience.
- While AI storytelling itself is not new, the project’s combination of strict orchestration, stat checks, and image continuity is a meaningful implementation.
