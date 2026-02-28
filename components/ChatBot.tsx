"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { FinancialSnapshot, WeeklyPlan } from "../lib/types";
import { t } from "../lib/translations";

interface ChatBotProps {
  context?: {
    snapshot: FinancialSnapshot | null;
    plan: WeeklyPlan | null;
  };
  lang?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const getSuggestionChips = (lang: string) => [
  t(lang, "explainOverdraft"),
  t(lang, "cancelSubs"),
  t(lang, "avalancheVsSnowball"),
  t(lang, "helpSave"),
];

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatBot({ context, lang = "en" }: ChatBotProps) {
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

        let replyText = "";

        if (res.ok) {
          const data = await res.json();
          replyText = data.reply || "";
        } else {
          // Try to extract error message from response body
          try {
            const errData = await res.json();
            console.error("[ChatBot] API error:", res.status, errData.error);
          } catch {
            console.error("[ChatBot] API error:", res.status);
          }
        }

        const botMessage: Message = {
          id: generateId(),
          role: "assistant",
          content:
            replyText || t(lang, "errorProcess"),
        };

        setMessages((prev) => [...prev, botMessage]);
      } catch (err) {
        console.error("[ChatBot] Network error:", err);
        const errorMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: t(lang, "errorNetwork"),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, context, lang]
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
            <strong key={j} className="font-semibold text-slate-100">
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
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-[#0f172a]"
        style={{
          background: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
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
        className={`fixed bottom-24 right-6 z-50 w-[calc(100vw-2rem)] sm:w-[400px] transition-all duration-300 ease-in-out ${
          isOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        style={{ height: "500px" }}
      >
        <div className="flex flex-col h-full rounded-2xl shadow-2xl border border-slate-700 overflow-hidden bg-[#1e293b]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#1e293b] border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{
                  background:
                    "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
                }}
              >
                AI
              </div>
              <div>
                <h3 className="text-slate-100 font-semibold text-sm leading-tight">
                  {t(lang, "askCopilot")}
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  {t(lang, "poweredByWatsonx")}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-700"
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
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#0f172a]">
            {/* Welcome message */}
            {messages.length === 0 && !isLoading && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-start gap-2">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5"
                    style={{
                      background:
                        "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
                    }}
                  >
                    AI
                  </div>
                  <div className="bg-[#334155] text-slate-300 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%]">
                    {t(lang, "welcomeMessage")}
                  </div>
                </div>

                {/* Suggestion chips */}
                <div className="flex flex-wrap gap-2 pl-8">
                  {getSuggestionChips(lang).map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleChipClick(chip)}
                      className="text-xs px-3 py-1.5 rounded-full border border-teal-500/30 text-teal-400 hover:text-teal-300 hover:border-teal-500/50 hover:bg-teal-500/10 transition-all duration-200"
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
                        "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
                    }}
                  >
                    AI
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-tr-md"
                      : "bg-[#334155] text-slate-300 rounded-tl-md"
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
                      "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
                  }}
                >
                  AI
                </div>
                <div className="bg-[#334155] text-slate-400 rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <form
            onSubmit={handleSubmit}
            className="px-3 py-3 border-t border-slate-700 bg-[#1e293b]"
          >
            <div className="flex items-center gap-2 bg-[#0f172a] rounded-xl border border-slate-700 focus-within:border-teal-500/50 transition-colors px-3 py-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t(lang, "askAboutFinances")}
                disabled={isLoading}
                className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 text-sm py-2 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-1.5 rounded-lg text-slate-500 hover:text-teal-400 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
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
