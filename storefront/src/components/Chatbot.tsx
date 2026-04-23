"use client";

import { useEffect, useRef, useState } from "react";
import { readProfile } from "@/lib/auth";
import { getIds } from "@/lib/analytics";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/+$/, "");

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "👋 Hello! I'm your AI shopping assistant. I can help you find products, answer store questions, and explain how customer behavior is impacting the site.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || loading) return;

    // Add user message
    const userMessage: ChatMessage = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      if (!API_BASE) {
        throw new Error("API base URL not configured");
      }

      const user = readProfile();
      const { sessionId } = getIds();

      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: input,
          action: "chat",
          user_id: user?.user_id,
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = (await response.json()) as { ok: boolean; message: string };

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.message || "I'm not sure how to respond to that.",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again or contact support.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = async () => {
    try {
      if (!API_BASE) return;

      await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: "", action: "clear" }),
      });

      setMessages([
        {
          role: "assistant",
          content: "Chat cleared! How can I help you?",
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Clear chat error:", error);
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="chatbotButton"
        aria-label="Open chat"
        title="Chat with AI Assistant"
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="chatbotWindow">
          <div className="chatbotHeader">
            <h3>🤖 Shopping Assistant</h3>
            <div className="chatbotHeaderActions">
              <button
                onClick={handleClearChat}
                className="chatbotIconBtn"
                title="Clear chat"
                aria-label="Clear chat"
              >
                🔄
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="chatbotIconBtn"
                title="Close chat"
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="chatbotMessages">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`chatbotMessage chatbotMessage--${msg.role}`}
              >
                <div className="chatbotMessageContent">
                  {msg.content}
                </div>
                <span className="chatbotMessageTime">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
            {loading && (
              <div className="chatbotMessage chatbotMessage--assistant">
                <div className="chatbotMessageContent">
                  <span className="chatbotTyping">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="chatbotForm">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything..."
              className="chatbotInput"
              disabled={loading}
              autoFocus
            />
            <button
              type="submit"
              className="chatbotSendBtn"
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              {loading ? "..." : "→"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
