# I Have No Mouth but I Must Scream — AI Horror DnD

![Backend Deploy](https://github.com/Arlan-Z/gemini-hackathon-dnd-project/actions/workflows/backend-deploy.yml/badge.svg)
![Frontend Deploy](https://github.com/Arlan-Z/gemini-hackathon-dnd-project/actions/workflows/front-deploy.yml/badge.svg)

## Overview
This project is an interactive horror narrative game inspired by “I Have No Mouth, and I Must Scream.” The player makes choices; the AI Dungeon Master (AM) responds with story text, consequences, and scene visuals. The game tracks stats, inventory, tags, locations, and ends the session when sanity or HP collapses.

## Inspiration

This project started from a simple idea: we wanted to play a horror story where your choices actually matter, and the world remembers what you did. *I Have No Mouth, and I Must Scream* inspired the tone-psychological pressure, trap-like scenarios, and consequences you can’t talk your way out of.

We built it as an interactive narrative game: the player chooses actions, and an AI Dungeon Master responds with story, consequences, and scene visuals. Under the horror, it’s still a game-stats, sanity, HP, inventory, location, and tags all shape what happens next. When sanity or HP collapses, the run ends.


## What it does

It runs a turn-based horror RPG where Gemini acts as the Dungeon Master. Each player turn gets interpreted, resolved through deterministic server mechanics (stats, inventory, status effects, flags), and returned as strict JSON for the client. Every turn also produces an image of the current scene, so the story has a continuous visual layer.

## How we built it

We built the game around deterministic tool orchestration. Gemini doesn’t invent mechanics in plain text. Instead, it receives a fixed set of tools and decides which ones to call, in what order, and with what parameters.

### Tool-orchestrated game logic (server is the source of truth)

Gemini has six tools: stats/HP, inventory, status tags, endings/flags, scene state, and scene generation (including image generation). Every turn it reads the player action plus full context (stats, inventory, history), then executes a chain of tool calls.

Example turn flow: subtract HP → add the poisoned tag → consume an item → update scene state → generate the next scene + image. The server applies all updates deterministically, so the rules never drift.

### Two-layer Gemini architecture

Each player action goes through two Gemini services:

Router Service is a fast, low-temperature pass that classifies intent (exploration, combat, escape, etc.), estimates difficulty and emotional tone, and flags risky requests.

Orchestrator is the main DM. It writes the narrative and triggers the tool calls using the router hints plus full game context.

We run them at different temperatures: router for precision, orchestrator for atmosphere.

### Structured output + validation

All model responses return as strict JSON. We validate them against schemas, and if validation fails we automatically retry with a tighter schema so the client always receives usable data.

### Visual pipeline (Imagen) + continuity

Every turn generates a scene image via Imagen. We don’t send a loose prompt—we send structured descriptors (location, materials, lighting, mood) and persist them across turns to keep visuals consistent.

### Context Caching

The orchestrator’s heavy system prompt is cached via Gemini Context Caching to reduce token usage and keep long sessions responsive.


## Challenges we ran into

The hardest part was making the game genuinely interesting, not just “AI writes horror.” We had to build real gameplay loops: tension curves, meaningful choices, clear constraints, and consequences that feel fair even when they’re brutal.

Token limits were another constant fight. Horror depends on continuity—clues, foreshadowing, remembered injuries, recurring threats—and long sessions quickly hit budget. We had to decide what becomes persistent state, what gets summarized, and what gets dropped without breaking the feeling of a coherent run.

Image consistency was the third big pain point. Without strict continuity, visuals drift fast: materials change, layout morphs, lighting resets. We had to treat art direction like state—carry forward anchors and scene attributes every turn—so the world doesn’t randomly transform.

## Accomplishments that we're proud of

We built a DM loop where narrative and mechanics advance together in a single turn, without rule drift. Server-side determinism keeps stats and outcomes stable. Structured JSON plus validation made the client side reliable. And the per-turn visual layer holds together across multiple turns instead of feeling like disconnected illustrations.

## What we learned

Fun doesn’t emerge automatically from generative text; it comes from structure, pacing, and constraints. Under token limits, persisted state matters more than raw conversation history. Visual continuity is mostly a memory problem, not a prompt problem. Splitting routing from orchestration makes the system both more stable and easier to tune.

## What's next for a DnD-like game inspired by *I Have No Mouth, and I Must Scream*

Next we want to push the actual game design layer harder: better pacing, more encounter variety beyond combat, and more “no clean answer” dilemmas that still feel earned. We also want stronger memory under token limits through smarter summarization, key-event pinning, and state compression. On the visual side, we’ll tighten art direction with stronger scene bibles and persistent anchors for rooms and characters. Finally, we’ll expand replay value with more endings, hidden flags, and run-to-run variance that changes how the horror unfolds.
