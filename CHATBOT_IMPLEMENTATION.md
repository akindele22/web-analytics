# 🤖 AI Chatbot System - Updated Implementation

This project now includes an admin-focused AI chatbot with a flexible backend that supports local Hugging Face models, OpenAI/Claude APIs, and a rule-based fallback.

## What this implementation includes

### Backend Components

#### `backend/app/chatbot.py`
- ✅ Hybrid chatbot engine: auto-selects Hugging Face, OpenAI, Claude, or rule-based fallback
- ✅ Data-aware knowledge base: reads `products`, `orders`, `users`, and `web_events`
- ✅ Legacy analytics context: loads optional historical data from `old_data/` and root-level legacy CSV/XLSX files
- ✅ Marketing and KPI recommendations: returns analytics-driven campaign guidance
- ✅ Session history support: tracks chat history by `session_id` or `user_id`

#### `backend/app/api.py`
- `POST /api/chat`
  - Accepts `{ message, action, user_id, session_id }`
  - Supports `action: "chat"` and `action: "clear"`
  - Lazily initializes the chatbot instance
  - Returns JSON with `ok`, `message`, and `timestamp`

### Frontend Components

#### `storefront/src/components/Chatbot.tsx`
- ✅ Floating chat button with open/close behavior
- ✅ Message history and smooth auto-scroll
- ✅ Loading state while waiting for responses
- ✅ Clear chat history button
- ✅ Sends chat requests to the backend via `NEXT_PUBLIC_API_BASE`
- ✅ Preserves session/user context for better continuity

#### `storefront/src/app/layout.tsx`
- Integrates the chatbot globally so it appears across pages

---

## How the chatbot works now

### Chat endpoint behavior
- `POST /api/chat` accepts:
  - `message`: the user query
  - `action`: `chat` or `clear`
  - `user_id`: optional authenticated user ID
  - `session_id`: optional session identifier
- If `action == "clear"`, the backend clears stored history for that session/user
- Otherwise the backend generates a response and returns it in `message`

### Intelligent model selection
The backend chooses the best available chatbot backend in this order:
1. `CHATBOT_PROVIDER=hf` with Hugging Face installed
2. `CHATBOT_PROVIDER=openai`
3. `CHATBOT_PROVIDER=claude`
4. No configured provider → rule-based fallback

### Supported providers
- `hf` — local Hugging Face model via `transformers` and `torch`
- `openai` — OpenAI Chat Completion API
- `claude` — Anthropic Claude API
- fallback — rule-based admin chatbot

---

## Data sources and knowledge base

The chatbot builds context from these data sources:
- `backend/data/products.csv`
- `backend/data/orders.csv`
- `backend/data/users.csv`
- `backend/data/web_events.csv`

It also optionally loads legacy datasets from:
- `old_data/customers.csv`
- `old_data/products.csv`
- `old_data/events.xlsx` / `events.xls` / `events.xlsm`
- root-level `Constructed  Customer Dataset.csv`

Legacy data is used to add historical marketing and customer segment context to recommendations.

---

## Implementation details

### `LocalLLMChatbot`
- Builds admin-focused prompts with analytics context
- Adds marketing and KPI insights into the prompt when relevant
- Uses smaller prompts for lite models to reduce hallucinations
- Supports local Hugging Face inference, OpenAI API, and Claude API
- Keeps a conversation history for each session/user

### `SimpleChatbot` fallback
- Uses keyword pattern matching
- Returns analytics or marketing recommendations from the built-in knowledge base
- Provides sensible fallback responses when LLMs are unavailable

---

## Configuration

### Environment variables
- `CHATBOT_PROVIDER` — `hf`, `openai`, `claude`, or unset for fallback
- `HF_MODEL_NAME` — model name for Hugging Face local inference
- `OPENAI_API_KEY` — required for OpenAI provider
- `CLAUDE_API_KEY` — required for Claude provider
- `NEXT_PUBLIC_API_BASE` — used by the storefront chat widget

### Recommended local setup
- `CHATBOT_PROVIDER=hf`
- `HF_MODEL_NAME=distilgpt2` (or another local inference model)
- `pip install transformers torch requests`

### Optional API-backed setup
- For OpenAI: set `OPENAI_API_KEY`
- For Claude: set `CLAUDE_API_KEY`

---

## Quick start

### Backend
```bash
cd backend
python run.py
```

### Frontend
```bash
cd storefront
npm run dev
```

Open `http://localhost:3000` and click the chat button in the lower-right corner.

---

## Admin chat examples

### Marketing guidance
```
User: "How should I promote our top-performing products this week?"
Bot: "Based on current analytics, focus on high-engagement categories, prioritize top traffic channels, and reuse successful campaign tags. Promote your strongest product categories through email and social ads."
```

### Performance insight
```
User: "What can I do to improve conversion rates?"
Bot: "Review your top-performing channels, optimize product page flow, and offer targeted promotions to loyalty segments with high engagement."
```

### Analytics request
```
User: "Show me insights on customer behavior and campaigns."
Bot: "Here are the best recommendations from your current analytics and legacy campaign signals..."
```

---

## Key files
- `backend/app/chatbot.py`
- `backend/app/api.py`
- `storefront/src/components/Chatbot.tsx`
- `storefront/src/app/layout.tsx`

---

## Notes
- This implementation is admin-focused and built around analytics-driven insights
- It gracefully falls back to rule-based responses if no model provider is configured
- It supports both local and API-backed LLM providers without requiring Ollama specifically
