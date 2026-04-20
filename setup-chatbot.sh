#!/bin/bash
# Chatbot Quick Setup Script
# Run this to set up the AI chatbot with Ollama

echo "======================================"
echo "🤖 AI Chatbot Setup"
echo "======================================"
echo ""

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama not found!"
    echo "Download from: https://ollama.ai"
    echo ""
    read -p "Press Enter after installing Ollama..."
fi

# Check if Ollama is running
echo "Checking if Ollama is running..."
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama is running!"
else
    echo "⚠️  Ollama is NOT running"
    echo "Please run in another terminal: ollama serve"
    echo ""
    read -p "Press Enter after starting Ollama..."
fi

# Pull the model
echo ""
echo "Pulling Mistral model (7B, ~4GB)..."
echo "This may take a few minutes on first run..."
ollama pull mistral

# Confirmation
echo ""
echo "======================================"
echo "✅ Chatbot Setup Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Start backend: cd backend && python run.py"
echo "2. Start frontend: cd storefront && npm run dev"
echo "3. Open: http://localhost:3000"
echo "4. Click 💬 button in bottom-right"
echo ""
echo "To use a different model, edit:"
echo "backend/app/chatbot.py line 28"
echo ""
echo "Available models:"
echo "  - mistral       (recommended, 7B)"
echo "  - neural-chat   (7B, optimized for chat)"
echo "  - llama2        (7B, general)"
echo "  - dolphin-mixtral (8x7B, needs 16GB RAM)"
echo ""
