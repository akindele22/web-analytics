"""
AI Chatbot module for E-commerce Analytics.
Provides analytics-driven marketing recommendations and business intelligence for admins.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from app.recommendations import format_admin_recommendation_summary, generate_admin_recommendation_insights
from app.store import read_table


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _pick_case_insensitive(folder: Path, candidates: list[str]) -> Path | None:
    for name in candidates:
        path = folder / name
        if path.exists():
            return path
    try:
        files = {p.name.lower(): p for p in folder.iterdir() if p.is_file()}
    except FileNotFoundError:
        return None
    for name in candidates:
        match = files.get(name.lower())
        if match:
            return match
    return None


def _load_old_data() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    root = _repo_root()
    customer_candidates = ["customers.csv"]
    product_candidates = ["products.csv"]
    events_candidates = ["events.xlsx", "eventss.xlsx", "events.xls", "events.xlsm"]
    constructed_candidates = [
        "customer_dataset.csv",
        "customer dataset.csv",
        "constructed_customer_dataset.csv",
        "constructed customer dataset.csv",
        "Constructed  Customer Dataset.csv",
        "Constructed Customer Dataset.csv",
    ]

    search_dirs = [root / "old_data", root]
    for folder in search_dirs:
        customers_path = _pick_case_insensitive(folder, customer_candidates)
        products_path = _pick_case_insensitive(folder, product_candidates)
        events_path = _pick_case_insensitive(folder, events_candidates)
        constructed_path = _pick_case_insensitive(folder, constructed_candidates)

        if not customers_path or not products_path or not events_path or not constructed_path:
            continue

        customers = pd.read_csv(customers_path)
        products = pd.read_csv(products_path)
        events = pd.read_excel(events_path, sheet_name=0)
        constructed = pd.read_csv(constructed_path)
        return customers, products, events, constructed

    return pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), pd.DataFrame()


# Try to import optional LLM libraries
try:
    import requests
except ImportError:
    requests = None

try:
    import torch
except ImportError:
    torch = None

try:
    from transformers import pipeline
    HF_AVAILABLE = True
except ImportError:
    HF_AVAILABLE = False


@dataclass
class ChatMessage:
    role: str  # "user" or "assistant"
    content: str


class KnowledgeBase:
    """Build and manage the chatbot's knowledge base from analytics data for admin use."""

    def __init__(self):
        self.products = read_table("products")
        self.orders = read_table("orders")
        self.users = read_table("users")
        self.web_events = read_table("web_events")
        self.old_customers, self.old_products, self.old_events, self.old_constructed = _load_old_data()
        self.old_marketing_context = self._build_old_data_marketing_context()

    def _build_old_data_marketing_context(self) -> str:
        if self.old_events.empty or self.old_customers.empty or self.old_products.empty:
            return ""

        top_channels = (
            self.old_customers["acquisition_channel"].fillna("Unknown").value_counts().head(3)
            if "acquisition_channel" in self.old_customers.columns
            else pd.Series(dtype="int64")
        )
        top_traffic = (
            self.old_events["traffic_source"].fillna("Unknown").value_counts().head(3)
            if "traffic_source" in self.old_events.columns
            else pd.Series(dtype="int64")
        )
        top_categories = (
            self.old_products["category"].fillna("General").value_counts().head(3)
            if "category" in self.old_products.columns
            else pd.Series(dtype="int64")
        )
        loyal_tiers = (
            self.old_customers["loyalty_tier"].fillna("Unknown").value_counts().head(2)
            if "loyalty_tier" in self.old_customers.columns
            else pd.Series(dtype="int64")
        )

        lines = [
            "Legacy customer and campaign data suggests these strong marketing signals:",
        ]

        if not top_channels.empty:
            channels = ", ".join(top_channels.index.tolist())
            lines.append(f"- Top acquisition channels were: {channels}. Prior campaigns performed best through these channels.")

        if not top_traffic.empty:
            traffic = ", ".join(top_traffic.index.tolist())
            lines.append(f"- Highest historical traffic sources were: {traffic}. Use similar sources for your next promotion.")

        if not top_categories.empty:
            categories = ", ".join(top_categories.index.tolist())
            lines.append(f"- Strong legacy product categories were: {categories}. Consider promoting these categories first.")

        if not loyal_tiers.empty:
            tiers = ", ".join(loyal_tiers.index.tolist())
            lines.append(f"- Customer segments with the best loyalty were: {tiers}. Target those tiers with retention offers and VIP campaigns.")

        return "\n".join(lines)

    def _get_current_marketing_signals(self) -> dict[str, list[str]]:
        """Extract high-performing signals from current web events."""
        if self.web_events.empty:
            return {}

        signals = {}
        # Top Channels
        if "channel" in self.web_events.columns:
            valid = self.web_events[~self.web_events["channel"].isin(["", "Unknown", "unknown"])]
            if not valid.empty:
                signals["channels"] = valid["channel"].value_counts().head(3).index.tolist()

        # Top UTM Sources
        if "utm_source" in self.web_events.columns:
            valid = self.web_events[~self.web_events["utm_source"].isin(["", "Unknown", "unknown"])]
            if not valid.empty:
                signals["sources"] = valid["utm_source"].value_counts().head(3).index.tolist()

        # Top Campaigns
        if "utm_campaign" in self.web_events.columns:
            valid = self.web_events[~self.web_events["utm_campaign"].isin(["", "Unknown", "unknown"])]
            if not valid.empty:
                signals["campaigns"] = valid["utm_campaign"].value_counts().head(3).index.tolist()

        # Top Categories by engagement (likes + purchases)
        if not self.products.empty:
            merged = self.web_events.merge(self.products[["sku", "category"]], left_on="product_sku", right_on="sku", how="inner")
            if not merged.empty:
                top_cats = merged[merged["event_type"].isin(["purchase", "like", "add_to_cart"])]
                valid_cats = top_cats[~top_cats["category"].isin(["", "Unknown", "unknown"])]
                if not valid_cats.empty:
                    signals["categories"] = valid_cats["category"].value_counts().head(3).index.tolist()

        return signals

    def get_analytics_recommendation_text(self) -> str:
        """Generate a short analytics-driven recommendation summary."""
        try:
            insights = generate_admin_recommendation_insights()
            return format_admin_recommendation_summary(insights, max_items=3)
        except Exception:
            return "I couldn't generate website recommendation insights at the moment."

    def get_marketing_recommendation_text(self) -> str:
        """Generate marketing and campaign recommendations from analytics."""
        try:
            signals = self._get_current_marketing_signals()
            signal_lines: list[str] = []
            if signals.get("channels"):
                channels = ", ".join(signals["channels"])
                signal_lines.append(
                    f"Current top engagement channels are: {channels}. Focus campaigns on those channels first."
                )
            if signals.get("sources"):
                sources = ", ".join(signals["sources"])
                signal_lines.append(
                    f"Top UTM sources are: {sources}. Use these sources for your next promotional pushes."
                )
            if signals.get("campaigns"):
                campaigns = ", ".join(signals["campaigns"])
                signal_lines.append(
                    f"Strong historical campaign tags include: {campaigns}. Reuse or test similar campaign themes."
                )
            if signals.get("categories"):
                categories = ", ".join(signals["categories"])
                signal_lines.append(
                    f"Best product categories right now are: {categories}. Promote these categories with targeted messaging."
                )

            insights = generate_admin_recommendation_insights()
            recommendations = insights.get("recommendations", [])
            if recommendations:
                if not signal_lines:
                    signal_lines.append(
                        "These products are your strongest campaign candidates based on current analytics engagement:"
                    )
                for idx, row in enumerate(recommendations[:3], start=1):
                    signal_lines.append(
                        f"{idx}. {row['product_name']} ({row['product_sku']}) in {row['category']} — current signals: views={row['views']}, likes={row['likes']}, purchases={row['purchases']}."
                    )

            if self.old_marketing_context:
                signal_lines.append("Legacy data also highlights broader campaign and customer signals:")
                signal_lines.append(self.old_marketing_context)

            if signal_lines:
                lines = [
                    "Based on your analytics data, here is the best marketing campaign direction:",
                ]
                lines.extend(signal_lines)
                lines.append(
                    "Use these signals to shape your next promotion: choose high-engagement categories, lean into proven channels, and align messaging with loyal customer segments."
                )
                return "\n".join(lines)

            # Fallback campaign guidance when analytics output is insufficient
            fallback_lines = [
                "I couldn't find strong campaign-specific signals in the current analytics, but here is a practical promotion approach:",
                "- Promote your highest-engagement product categories with a mix of email and social ads.",
                "- Focus on channels where traffic is already trending higher, and test campaign themes that feature your most popular categories.",
                "- Use limited-time offers or bundle deals to convert interest into sales.",
            ]
            if self.old_marketing_context:
                fallback_lines.append("Legacy insights still recommend these market signals:")
                fallback_lines.append(self.old_marketing_context)
            return "\n".join(fallback_lines)
        except Exception:
            fallback_lines = [
                "I'm having trouble generating a full campaign forecast, but here's a marketing direction:",
                "- Highlight your strongest categories and promote them in top customer channels.",
                "- Use email, social, and homepage messaging to increase visibility.",
                "- Offer a clear promotion or time-limited incentive to improve conversions.",
            ]
            if self.old_marketing_context:
                fallback_lines.append("Legacy data also suggests these customer and campaign signals:")
                fallback_lines.append(self.old_marketing_context)
            return "\n".join(fallback_lines)

    def get_relevant_info(self, query: str, user_id: str | None = None) -> str:
        """Get relevant analytics and marketing information for admin queries."""
        query_lower = query.lower()
        context = []

        # Provide analytics-driven recommendation insights for admin queries
        if any(word in query_lower for word in ["insight", "optimize", "improve", "conversion", "sales", "website", "site", "page", "customer", "performance", "analytics", "kpi", "metrics"]):
            analytics_text = self.get_analytics_recommendation_text()
            if analytics_text:
                context.append(analytics_text)

        # Check for marketing and campaign queries
        if any(word in query_lower for word in ["promote", "promotion", "campaign", "marketing", "ads", "advertise", "traffic", "engagement", "channel", "strategy", "growth"]):
            marketing_text = self.get_marketing_recommendation_text()
            if marketing_text:
                context.append(marketing_text)
            if self.old_marketing_context:
                context.append(self.old_marketing_context)

        return "\n\n".join(context) if context else ""


class LocalLLMChatbot:
    """Admin-focused chatbot using Hugging Face transformers, OpenAI, or Claude."""

    def __init__(self, model_name: str = "distilgpt2", provider: str = "hf"):
        env_model = os.getenv("CHATBOT_MODEL", "").strip()
        hf_model = os.getenv("HF_MODEL_NAME", "").strip()
        self.provider = provider.lower().strip() or "hf"
        self.model_name = env_model or model_name
        if self.provider == "hf":
            self.model_name = hf_model or env_model or "distilgpt2"
        elif self.provider == "openai":
            self.model_name = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo").strip() or "gpt-3.5-turbo"
        elif self.provider == "claude":
            self.model_name = os.getenv("CLAUDE_MODEL", "claude-3.5-mini").strip() or "claude-3.5-mini"
        self.knowledge_base = KnowledgeBase()
        self.histories: dict[str, list[ChatMessage]] = {}
        self._init_model()

    def _init_model(self) -> None:
        """Initialize the LLM."""
        if self.provider == "hf":
            if not HF_AVAILABLE:
                print("⚠️  Hugging Face transformers not installed. Install with: pip install transformers torch")
        elif self.provider == "openai":
            if not os.getenv("OPENAI_API_KEY", "").strip():
                print("⚠️  OPENAI_API_KEY is not configured. Falling back to rule-based chatbot.")
        elif self.provider == "claude":
            if not os.getenv("CLAUDE_API_KEY", "").strip():
                print("⚠️  CLAUDE_API_KEY is not configured. Falling back to rule-based chatbot.")

    def _call_openai(self, prompt: str) -> str:
        if not requests:
            return "Requests library not available for OpenAI API calls."

        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            return "OpenAI API key is not configured."

        model = self.model_name or "gpt-3.5-turbo"
        try:
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.7,
                    "max_tokens": 400,
                },
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            return str(data.get("choices", [{}])[0].get("message", {}).get("content", "")).strip()
        except Exception as e:
            print(f"OpenAI error: {e}")
            return "I couldn't generate a response from OpenAI right now."

    def _call_claude(self, prompt: str) -> str:
        if not requests:
            return "Requests library not available for Claude API calls."

        api_key = os.getenv("CLAUDE_API_KEY", "").strip()
        if not api_key:
            return "Claude API key is not configured."

        model = self.model_name or "claude-3.5-mini"
        try:
            response = requests.post(
                "https://api.anthropic.com/v1/complete",
                headers={
                    "x-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "prompt": f"Human: {prompt}\n\nAssistant:",
                    "max_tokens_to_sample": 400,
                    "temperature": 0.7,
                },
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            return str(data.get("completion", "")).strip()
        except Exception as e:
            print(f"Claude error: {e}")
            return "I couldn't generate a response from Claude right now."

    def _call_huggingface(self, prompt: str) -> str:
        """Call local Hugging Face model."""
        try:
            # Detect the appropriate task based on the model name
            # T5-style models use text2text-generation, while GPT-style use text-generation
            is_t5 = "t5" in self.model_name.lower()
            task = "text2text-generation" if is_t5 else "text-generation"
            
            if not hasattr(self, "_generator"):
                from transformers import pipeline
                device = 0 if (torch and torch.cuda.is_available()) else -1
                self._generator = pipeline(task, model=self.model_name, device=device)

            if is_t5:
                # T5 models expect shorter, direct instructions
                response = self._generator(
                    prompt,
                    max_length=256,
                    truncation=True,
                    do_sample=True,
                    temperature=0.5,
                )
                text = response[0]["generated_text"]
            else:
                # GPT-style models like distilgpt2
                response = self._generator(
                    prompt,
                    max_new_tokens=100,
                    truncation=True,
                    do_sample=True,
                    temperature=0.7,
                    return_full_text=False,
                )
                text = response[0]["generated_text"]
            return text.strip()
        except Exception as e:
            print(f"Hugging Face error: {e}")
            # Fall back to rule-based response if HF model fails.
            fallback = SimpleChatbot()
            return fallback.generate_response(prompt.splitlines()[-1])

    def generate_response(self, user_message: str, user_id: str | None = None, session_id: str | None = None) -> str:
        """Generate chatbot response."""
        # Determine identity for history tracking
        conv_id = session_id or user_id or "anonymous"
        if conv_id not in self.histories:
            self.histories[conv_id] = []
        
        history = self.histories[conv_id]
        history.append(ChatMessage(role="user", content=user_message))

        # Get relevant context from knowledge base
        context = self.knowledge_base.get_relevant_info(user_message, user_id)

        # Determine if we are using a "lite" model to adjust prompt complexity
        is_lite = any(m in self.model_name.lower() for m in ["gpt2", "t5", "small", "tiny"])

        # Build prompt
        if is_lite:
            # Condensed prompt for small models to prevent context overflow and hallucinations
            system_prompt = "You are an E-commerce Analytics Assistant for admins. Use the following data to provide marketing and business insights."
        else:
            # Full prompt for larger models
            system_prompt = """You are an expert E-commerce Analytics Strategist for administrators and marketers.
Analyze the provided "Relevant information" (which contains real-time analytics and legacy trends) to suggest specific marketing actions and business strategies.

Key Guidelines:
1. Use data points (conversion rates, top channels, customer segments) to justify your recommendations.
2. Compare historical trends with current performance.
3. Focus on actionable insights for campaign optimization, customer acquisition, and revenue growth.
4. Suggest specific products, channels, and strategies based on the analytics data.
5. Keep responses professional, data-driven, and focused on business outcomes."""

        # Add context if available
        if context:
            system_prompt += f"\n\nRelevant information:\n{context}"

        # Build conversation context
        conversation_text = ""
        history_limit = 2 if is_lite else 6 # Reduce history for lite models
        for msg in history[-history_limit:]:
            role = "Admin" if msg.role == "user" else "Assistant"
            conversation_text += f"{role}: {msg.content}\n"

        # Create final prompt
        prompt = f"""{system_prompt}

Conversation:
{conversation_text}
Assistant: """

        # Generate response
        if self.provider == "openai":
            response = self._call_openai(prompt)
        elif self.provider == "claude":
            response = self._call_claude(prompt)
        else:
            response = self._call_huggingface(prompt)

        # Add assistant message to history
        history.append(ChatMessage(role="assistant", content=response))

        # Keep history manageable (last 20 messages)
        if len(history) > 20:
            self.histories[conv_id] = history[-20:]

        return response

    def clear_history(self, session_id: str | None = None) -> None:
        """Clear conversation history."""
        self.histories.pop(session_id or "anonymous", None)


# Fallback simple chatbot if no LLM is available
class SimpleChatbot:
    """Simple rule-based admin chatbot as fallback."""

    def __init__(self):
        self.knowledge_base = KnowledgeBase()
        self.responses = {
            "hello|hi|hey": "Hello!👋 I'm your analytics assistant. How can I help with your marketing strategy or business insights today?",
            "analytics|kpi|metrics": "I can provide insights on website performance, conversion rates, and customer behavior. What specific metrics are you interested in?",
            "campaign|marketing|promote": "I can help with campaign recommendations based on your analytics data. What type of promotion are you planning?",
            "sales|revenue|growth": "I can analyze sales trends and growth opportunities. Would you like insights on customer acquisition or retention?",
            "optimize|improve|conversion": "I can suggest optimization strategies based on your current performance data. What area would you like to focus on?",
            "help|support": "I'm here to help with analytics, marketing strategy, and business insights. Ask me about campaigns, performance, or customer behavior.",
        }

    def generate_response(self, user_message: str, user_id: str | None = None) -> str:
        """Generate simple rule-based admin response."""
        message_lower = user_message.lower()

        # Marketing and campaign queries
        if any(word in message_lower for word in ["promote", "promotion", "campaign", "marketing", "ads", "advertise", "traffic", "engagement", "channels", "categories", "strategy"]):
            marketing_text = self.knowledge_base.get_marketing_recommendation_text()
            if marketing_text:
                return marketing_text

        # Analytics and performance queries
        if any(word in message_lower for word in ["insight", "optimize", "improve", "conversion", "traffic", "sales", "website", "site", "page", "customer", "performance", "analytics", "kpi", "metrics", "growth", "revenue"]):
            analytics_text = self.knowledge_base.get_analytics_recommendation_text()
            if analytics_text:
                return analytics_text

        # Check pattern matching
        for pattern, response in self.responses.items():
            if any(keyword in message_lower for keyword in pattern.split("|")):
                return response

        # Default response
        return "I'm not sure I understand. Can you rephrase? I can help with analytics, marketing campaigns, performance insights, or business strategy."

    def clear_history(self, session_id: str | None = None) -> None:
        """Placeholder for compatibility."""
        pass


def get_chatbot() -> SimpleChatbot:
    """Get appropriate admin chatbot instance."""
    provider = os.getenv("CHATBOT_PROVIDER", "").strip().lower()
    if provider == "hf":
        if HF_AVAILABLE:
            return LocalLLMChatbot(provider="hf")
        print("⚠️  Hugging Face transformers not installed. Install with: pip install transformers torch")
        return SimpleChatbot()
    if provider == "openai":
        return LocalLLMChatbot(provider="openai")
    if provider == "claude":
        return LocalLLMChatbot(provider="claude")

    # Default to Hugging Face for admin analytics support
    if HF_AVAILABLE:
        return LocalLLMChatbot(provider="hf")
    print("⚠️  Defaulting to rule-based admin chatbot for stable responses.")
    return SimpleChatbot()
