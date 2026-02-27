"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { FinancialSnapshot, WeeklyPlan } from "../lib/types";

interface ChatBotProps {
  context?: {
    snapshot: FinancialSnapshot | null;
    plan: WeeklyPlan | null;
  };
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTION_CHIPS = [
  "Explain my overdraft risk",
  "How do I cancel subscriptions?",
  "What is avalanche vs snowball?",
  "Help me save more",
];

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatBot({ context }: ChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: text.trim(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            history,
            context: {
              snapshot: context?.snapshot || null,
              plan: context?.plan || null,
            },
          }),
        });

        const data = await res.json();

        const botMessage: Message = {
          id: generateId(),
          role: "assistant",
          content:
            data.reply || "Sorry, I could not process that. Please try again.",
        };

        setMessages((prev) => [...prev, botMessage]);
      } catch {
        const errorMessage: Message = {
          id: generateId(),
          role: "assistant",
          content:
            "Sorry, something went wrong. Please check your connection and try again.",
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, context]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleChipClick = (chip: string) => {
    sendMessage(chip);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Render message content with basic markdown-like formatting
  function renderContent(content: string) {
    const lines = content.split("\n");
    return lines.map((line, i) => {
      // Bold text: **text**
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const rendered = parts.map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={j} className="font-semibold text-gray-100">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={j}>{part}</span>;
      });

      return (
        <span key={i}>
          {rendered}
          {i < lines.length - 1 && <br />}
        </span>
      );
    });
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-[#0a0a0a]"
        style={{
          background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
        }}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>

      {/* Chat window */}
      <div
        className={`fixed bottom-24 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] transition-all duration-300 ease-in-out ${
          isOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        style={{ height: "500px" }}
      >
        <div className="flex flex-col h-full rounded-2xl shadow-2xl border border-gray-800 overflow-hidden bg-[#141414]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#141414] border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{
                  background:
                    "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                }}
              >
                AI
              </div>
              <div>
                <h3 className="text-gray-100 font-semibold text-sm leading-tight">
                  Ask Copilot
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  powered by watsonx.ai
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-800"
              aria-label="Close chat"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#0a0a0a]">
            {/* Welcome message */}
            {messages.length === 0 && !isLoading && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-start gap-2">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5"
                    style={{
                      background:
                        "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                    }}
                  >
                    AI
                  </div>
                  <div className="bg-[#1e1e1e] text-gray-300 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%]">
                    Hi! I am your financial copilot. I can help you understand
                    your plan, explain risks, and answer questions about your
                    finances. What would you like to know?
                  </div>
                </div>

                {/* Suggestion chips */}
                <div className="flex flex-wrap gap-2 pl-8">
                  {SUGGESTION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleChipClick(chip)}
                      className="text-xs px-3 py-1.5 rounded-full border border-gray-700 text-gray-400 hover:text-orange-400 hover:border-orange-500/50 hover:bg-orange-500/10 transition-all duration-200"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg, index) => (
              <div
                key={msg.id}
                className={`flex items-start gap-2 animate-slideUp ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {msg.role === "assistant" && (
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5"
                    style={{
                      background:
                        "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                    }}
                  >
                    AI
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-tr-md"
                      : "bg-[#1e1e1e] text-gray-300 rounded-tl-md"
                  }`}
                >
                  {msg.role === "assistant"
                    ? renderContent(msg.content)
                    : msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-start gap-2 animate-slideUp">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5"
                  style={{
                    background:
                      "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  }}
                >
                  AI
                </div>
                <div className="bg-[#1e1e1e] text-gray-400 rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <form
            onSubmit={handleSubmit}
            className="px-3 py-3 border-t border-gray-800 bg-[#141414]"
          >
            <div className="flex items-center gap-2 bg-[#0a0a0a] rounded-xl border border-gray-800 focus-within:border-orange-500/50 transition-colors px-3 py-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your finances..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-gray-100 placeholder-gray-600 text-sm py-2 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-1.5 rounded-lg text-gray-500 hover:text-orange-400 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
                aria-label="Send message"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Global styles for animations */}
      <style jsx global>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out forwards;
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
    </>
  );
}
