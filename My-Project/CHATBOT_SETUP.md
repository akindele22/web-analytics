# AI Chatbot Setup Guide

Your e-commerce site now includes a **pretrained AI chatbot** that helps customers with products, orders, and support. Here's how to set it up and use it.

## 🚀 Quick Start (Simple Mode)

By default, the chatbot uses a **simple rule-based system** that doesn't require any external setup.

1. **Start the backend:**
   ```bash
   cd backend
   python run.py
   ```

2. **Start the frontend:**
   ```bash
   cd storefront
   npm run dev
   ```

3. **Open:** http://localhost:3000

4. **Click the 💬 button** in the bottom-right corner to chat!

The simple chatbot can:
- ✅ Answer FAQs about shipping, returns, payments
- ✅ Search products by name or category
- ✅ Show user orders (when logged in)
- ✅ Provide product recommendations
- ✅ Respond to general questions

---

## 🤖 Advanced: Setup Local AI Model

For **more natural, sophisticated responses**, install and run a local LLM model using **Ollama**.

### Option 1: Ollama (Recommended for Beginners)

The chatbot integration is primarily rule-based. Ollama is optional and only used when the service is available.

**Step 1: Install Ollama**
- Download from: https://ollama.com
- Run the installer for your OS (Windows, Mac, Linux)

**Step 2: Start Ollama Server**

```bash
# On Windows (runs automatically after installation)
# On Mac/Linux:
ollama serve
```

Server runs on: `http://localhost:11434`

**Step 3: Download a Model**

In a new terminal, run:

```bash
# Pull the Mistral model
ollama pull mistral

# Or try other models:
ollama pull neural-chat     # (7B) Good for chat
ollama pull llama2          # (7B) Good general model
ollama pull dolphin-mixtral # (8x7B, needs 16GB RAM)
```

**Step 4: Restart Backend**

```bash
cd backend
python run.py
```

The Flask API automatically detects Ollama at `http://localhost:11434`. No additional environment variables are required.

**Step 5: Test in Chat**
- Open http://localhost:3000
- Click 💬
- Start chatting - you should get more natural responses!

**Example Prompts:**
- "What blue products do you have?"
- "Tell me about my orders"
- "Can I return items after 30 days?"
- "Recommend something from the electronics category"

---

### Option 2: Hugging Face Transformers (For Developers)

If you prefer running models directly in Python without Ollama:

**Step 1: Install Dependencies**

```bash
pip install transformers torch
```

**Step 2: The backend will auto-detect** and use Hugging Face!

**Note:** First run will download the model (~2-5GB), which takes a few minutes.

---

## 📊 What the Chatbot Knows

The chatbot has access to:

### 1. **Product Catalog**
- All products from `backend/data/products.csv`
- Names, categories, prices
- Can search and recommend

### 2. **User Orders** (when logged in)
- View order history
- Order status and totals
- Only their own orders (privacy)

### 3. **FAQ Knowledge Base**
```
- Shipping & Delivery
- Returns & Refunds
- Payment Methods
- Account Management
- Support Contact
```

### 4. **Store Policies**
```
- Return Policy (30 days)
- Privacy Policy
- Terms of Service
- Warranties
```

### 5. **Browsing History** (when logged in)
- Products they've viewed
- Personalized recommendations
- Smart suggestions

---

## 💬 Chat Features

### Available Commands

**General Chat:**
- Click the 💬 button to open
- Type your message and press Enter (or click →)
- Chat history is preserved while the window is open

**Clear History:**
- Click the 🔄 button to clear conversation
- Useful for starting fresh or changing topics

**Close Chat:**
- Click ✕ or the button again to close
- Chat remains available for next visit

### Smart Responses

The chatbot intelligently responds to:

| User Input | Bot Response |
|-----------|--------------|
| "Do you have blue shoes?" | Shows matching products |
| "What's your return policy?" | Explains 30-day returns |
| "Show me my orders" | Lists user's orders (logged in) |
| "Recommend products" | Suggests based on browsing history |
| "How do I track my shipment?" | Provides shipping info |
| "Can I use PayPal?" | Confirms payment methods |

---

## 🔧 Configuration

### Change the Model

**For Ollama**, edit `backend/app/chatbot.py`:

```python
def __init__(self, model_name: str = "mistral", use_ollama: bool = True):
    # Change "mistral" to any available model:
    #   - neural-chat
    #   - llama2
    #   - dolphin-mixtral
    # etc.
```

### Customizing FAQ

Add more FAQ entries in `backend/app/chatbot.py`:

```python
def _build_faq(self) -> dict[str, str]:
    return {
        "shipping": "...",
        "returns": "...",
        "your_topic": "Your answer here",  # Add new
    }
```

### Add Custom Policies

Edit `_build_policies()` in the same file:

```python
def _build_policies(self) -> dict[str, str]:
    return {
        "return_policy": "...",
        "your_policy": "Details here",  # Add new
    }
```

---

## 📈 Performance Tips

### Ollama Model Recommendations

| Model | Size | Speed | Quality | VRAM |
|-------|------|-------|---------|------|
| mistral | 7B | Fast ⚡ | Good | 4GB |
| neural-chat | 7B | Fast ⚡ | Very Good | 4GB |
| llama2 | 7B | Fast ⚡ | Good | 4GB |
| dolphin-mixtral | 8x7B | Slower | Excellent | 16GB |
| mistral-med | Large | Slowest | Best | 32GB+ |

**Recommended:** Start with `mistral` (balanced speed/quality)

### Speedup Tips

1. **Use GPU if available**
   ```bash
   # For NVIDIA GPU (CUDA)
   ollama pull mistral:latest
   # It will auto-detect and use GPU
   ```

2. **Fewer conversation turns**
   - Keep chat concise
   - Clear history periodically

3. **Lighter model**
   - Use `neural-chat` instead of larger models

---

## 🐛 Troubleshooting

### Chatbot Shows Generic Responses Only

**Cause:** Simple rule-based mode active
**Solution:** Install Ollama and models:
```bash
ollama serve        # In terminal 1
ollama pull mistral # In terminal 2
# Restart backend
```

### "I'm having trouble connecting to the model"

**Cause:** Ollama not running
**Solution:**
```bash
# Make sure Ollama is running:
ollama serve

# Check connection:
curl http://localhost:11434/api/tags
```

### Chat takes too long to respond

**Cause:** Using large model or Ollama not optimized
**Solution:**
- Switch to smaller model: `ollama pull neural-chat`
- Check if GPU is available
- Reduce context length in prompts

### ModuleNotFoundError: transformers

**Cause:** Hugging Face not installed
**Solution:**
```bash
pip install transformers torch
```

### Ollama won't install

**Solution:** 
- Download from https://ollama.ai
- Ensure your system meets requirements
- Try alternate installation method for your OS

---

## 📝 Use Cases

### Customer Support
```
User: "I haven't received my order"
Bot: "I can help! Here's your order info:
     Order #123: $45.99 on April 1
     Try the tracking number or contact support@..."
```

### Product Discovery
```
User: "What electronics do you have?"
Bot: "Here are our electronics:
     - Wireless Headphones: $79.99
     - USB-C Cable: $12.99
     - Phone Stand: $24.99"
```

### Personalized Recommendations
```
User: "What should I buy?"
Bot: "Based on what you've viewed:
     - Premium Keyboard: $89.99
     - Desk Lamp: $34.99
     - USB Hub: $29.99"
```

### FAQ Automation
```
User: "Do you have free shipping?"
Bot: "Yes! Free shipping on orders over $50.
     Standard: 5-7 days
     Express: $15, 2-3 days"
```

---

## 🔐 Privacy & Security

✅ **What's Protected:**
- User order data is private (only show own orders)
- Conversation history stored in browser only
- No data sent to external APIs (when using local LLM)
- CORS restricted to your domain

✅ **Best Practices:**
- Don't ask for sensitive data in chat
- Use HTTPS in production
- Regularly clear conversation history
- Monitor chat logs for issues

---

## 📊 API Details

### Chat Endpoint
```
POST /api/chat
```

**Request:**
```json
{
  "message": "What products do you have?",
  "action": "chat"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Here are our products...",
  "user_id": "038f043b-...",
  "timestamp": "2026-04-05T10:30:00Z"
}
```

### Clear History
```
POST /api/chat
```

**Request:**
```json
{
  "message": "",
  "action": "clear"
}
```

---

## 🚀 Next Steps

1. ✅ **Install Ollama** → Get better responses
2. ✅ **Pull a model** → More natural conversations
3. ✅ **Customize FAQ** → Add your specific policies
4. ✅ **Test thoroughly** → Try various prompts
5. ✅ **Deploy** → Ship with confidence

---

## Resources

- 🦙 **Ollama:** https://ollama.ai
- 🤗 **Hugging Face:** https://huggingface.co
- 📚 **Model Library:** https://huggingface.co/models
- 💾 **Local Setup Guide:** https://github.com/ollama/ollama

---

**Questions?** Check that:
1. Backend is running on port 8000
2. Frontend can reach backend (check env)
3. Ollama is running if using local LLM
4. Browser console has no errors (F12)

Happy chatting! 🤖💬
