# ECHOES OF HATE - AI Orchestration Architecture

## Overview

This project implements a **Deterministic AI Orchestration Engine** using Google Gemini's Function Calling capabilities. Instead of treating the AI as a simple text generator, we use it as an intelligent orchestrator that controls game logic through well-defined tools.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        PLAYER INPUT                              │
│                    "Я пью кислоту из банки"                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ROUTER SERVICE                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Intent Classification (gemini-2.0-flash)               │    │
│  │  • intent: "self_harm"                                  │    │
│  │  • confidence: 0.95                                     │    │
│  │  • difficulty: "deadly"                                 │    │
│  │  • emotionalTone: "desperate"                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR SERVICE                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Gemini as Dungeon Master (gemini-2.0-flash)            │    │
│  │  + System Prompt (AM personality)                       │    │
│  │  + Router Hints                                         │    │
│  │  + Game State Context                                   │    │
│  │  + Function Calling Tools                               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│    FUNCTION CALLS        │   │    NARRATIVE OUTPUT      │
│  ┌────────────────────┐  │   │                          │
│  │ update_player_stats│  │   │  "Кислота обжигает..."   │
│  │ {hp: -100,         │  │   │                          │
│  │  reason: "acid"}   │  │   │  Choices:                │
│  ├────────────────────┤  │   │  1. ...                  │
│  │ trigger_game_over  │  │   │  2. ...                  │
│  │ {type: "suicide"}  │  │   │  3. ...                  │
│  ├────────────────────┤  │   │                          │
│  │ generate_scene_img │  │   │                          │
│  │ {desc: "..."}      │  │   │                          │
│  └────────────────────┘  │   │                          │
└──────────────────────────┘   └──────────────────────────┘
            │
            ▼
┌──────────────────────────┐
│    TOOL EXECUTOR         │
│  Deterministic Logic     │
│  • HP calculation        │
│  • Inventory management  │
│  • Tag system            │
│  • Game over triggers    │
└──────────────────────────┘
            │
            ▼
┌──────────────────────────┐
│    GAME STATE            │
│  (Server-side truth)     │
└──────────────────────────┘
```

## Key Components

### 1. Router Service (`routerService.ts`)
First-pass intent classification using a fast model. Determines:
- **Intent Type**: exploration, combat, dialogue, item_use, self_harm, escape_attempt, rest
- **Difficulty**: trivial → deadly
- **Emotional Tone**: neutral, aggressive, fearful, desperate, cunning

This enables specialized handling and provides hints to the main orchestrator.

### 2. Orchestrator Service (`orchestratorService.ts`)
The main AI brain that:
- Receives player action + router hints
- Calls appropriate tools via Function Calling
- Executes tool loop until completion
- Generates narrative response

### 3. Game Tools (`gameTools.ts`)
Function declarations that Gemini can call:
- `update_player_stats` - HP, sanity, attributes
- `inventory_action` - add/remove items
- `add_tag` / `remove_tag` - status effects, story flags
- `trigger_game_over` - end game states
- `generate_scene_image` - visual generation

### 4. Tool Executor (`toolExecutor.ts`)
Deterministic execution of tool calls:
- All game logic runs on server
- No AI hallucination of mechanics
- Consistent, predictable results
- Full audit trail of actions

## Why This is "Robust"

### Logic-Narrative Decoupling
```
❌ Old Way: AI returns JSON with stat changes → Parse → Hope it's valid
✅ New Way: AI calls update_player_stats(hp: -10) → Server executes → Guaranteed correct
```

### Deterministic Game Mechanics
- HP calculations happen in code, not in AI's imagination
- Inventory is managed by actual data structures
- Game over conditions are checked programmatically

### Multi-Stage Processing
1. **Router** classifies intent (fast, cheap)
2. **Orchestrator** handles complex reasoning (with hints)
3. **Executor** applies changes (deterministic)

### Audit Trail
Every action is logged:
```json
{
  "orchestration": {
    "mode": "function_calling",
    "routing": {
      "intent": "self_harm",
      "confidence": 0.95,
      "difficulty": "deadly"
    },
    "toolCalls": [
      {"tool": "update_player_stats", "args": {"hp": -100}, "success": true},
      {"tool": "trigger_game_over", "args": {"type": "suicide"}, "success": true}
    ]
  }
}
```

## API Response Structure

```typescript
interface GameResponse {
  sessionId: string;
  story_text: string;
  stat_updates: Record<string, number>;
  choices: string[];
  image_prompt: string | null;
  image_url: string | null;
  state: {
    stats: PlayerStats;
    inventory: InventoryItem[];
    tags: string[];
    isGameOver: boolean;
  };
  orchestration: {
    mode: "function_calling";
    routing?: {
      intent: string;
      confidence: number;
      reasoning: string;
      difficulty: string;
      emotionalTone: string;
    };
    toolCalls: ToolCallLog[];
    isGameOver: boolean;
    gameOverDescription: string | null;
  };
}
```

## Presentation Talking Points

> "ECHOES OF HATE is not just a chatbot wrapper. It is a **Deterministic AI Orchestration Engine**."

1. **Logic-Narrative Decoupling**: We use Gemini Function Calling to separate storytelling from game logic. Gemini acts as the Dungeon Master, executing server-side code to manage player state deterministically. This prevents "hallucinated mechanics."

2. **Intent-Based Routing**: A fast classifier pre-analyzes player actions, enabling specialized handling and providing context hints to the main orchestrator.

3. **Tool-Based Architecture**: Six well-defined tools give the AI precise control over game state without the ability to "make up" mechanics.

4. **Full Observability**: Every AI decision is logged and traceable, enabling debugging and demonstrating the orchestration flow.

## Future Enhancements

- **Context Caching**: Implement Gemini 1.5's context caching for long sessions
- **Parallel Tool Execution**: Execute independent tools simultaneously
- **Specialized Solvers**: Different AI configurations for combat vs. dialogue
- **Streaming Responses**: Real-time narrative generation
