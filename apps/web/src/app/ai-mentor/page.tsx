"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Bot,
  Users,
  Clock,
  Sparkles,
  Crown,
  MessageSquare,
  ChevronLeft,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarkdownMessage } from "@/components/features/workspace/MarkdownMessage";
import {
  MENTOR_PERSONAS,
  type MentorPersona,
  type MentorMessage,
  MOCK_ROOMS,
  type MentorRoom,
  mockMentorReply,
  mockSuggestions,
  MENTOR_ONLINE_LABEL,
} from "./mentor-data";
import { VipGate } from "./VipGate";

/**
 * ─────────────────────────────────────────────────────────────
 *  AI MENTOR ROOM — Trang chính cho gói VIP 199k/tháng
 *
 *  Layout:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  Sidebar (trái)     │  Chat area (giữa)                 │
 *  │  - Danh sách mentor │  - Header mentor + trạng thái     │
 *  │  - Lịch sử phòng    │  - Tin nhắn (markdown)            │
 *  │  - Quick actions    │  - Input + gửi                    │
 *  └─────────────────────┴───────────────────────────────────┘
 *
 *  UI-first: toàn bộ logic mock local. Khi có backend, thay
 *  mockMentorReply bằng fetch POST /api/ai-mentor/{room}/chat.
 * ─────────────────────────────────────────────────────────────
 */

export default function AiMentorPage() {
  return (
    <VipGate>
      <AiMentorContent />
    </VipGate>
  );
}

function AiMentorContent() {
  // ── State ──────────────────────────────────────────────
  const [activePersona, setActivePersona] = useState<MentorPersona>(
    MENTOR_PERSONAS[0]
  );
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Auto-scroll to bottom ──────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // ── Gửi tin nhắn ───────────────────────────────────────
  const sendMessage = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    // Thêm tin nhắn user ngay
    const userMsg: MentorMessage = {
      id: Date.now(),
      role: "user",
      content: trimmed,
      time: new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Mock streaming — trả lời sau 800ms
    setTimeout(() => {
      const reply = mockMentorReply(activePersona.key, trimmed);
      const mentorMsg: MentorMessage = {
        id: Date.now() + 1,
        role: "mentor",
        content: reply,
        time: new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        suggestions: mockSuggestions(activePersona.key),
      };
      setMessages((prev) => [...prev, mentorMsg]);
      setIsTyping(false);
    }, 800);
  }, [input, isTyping, activePersona, scrollToBottom]);

  // ── Gửi nhanh bằng Enter ───────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Copy tin nhắn ──────────────────────────────────────
  const copyToClipboard = (content: string, id: number) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Chọn mentor mới ────────────────────────────────────
  const handleSelectPersona = (persona: MentorPersona) => {
    setActivePersona(persona);
    setMessages([]);
  };

  // ── Gửi câu hỏi nhanh ──────────────────────────────────
  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-64px)] flex bg-background text-foreground overflow-hidden">
      {/* ── Sidebar ── */}
      <AnimatePresence initial={false}>
        {showHistory && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-r border-border bg-card/60 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Chọn Mentor
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(false)}
                  className="h-6 w-6 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>

              {/* Danh sách mentor */}
              <div className="space-y-2">
                {MENTOR_PERSONAS.map((p) => {
                  const Icon = p.icon;
                  const isActive = activePersona.key === p.key;
                  return (
                    <button
                      key={p.key}
                      onClick={() => handleSelectPersona(p)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                        isActive
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/60 border border-transparent"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full bg-gradient-to-br ${p.color} flex items-center justify-center shrink-0`}
                      >
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.title}
                        </p>
                      </div>
                      {isActive && (
                        <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lịch sử phòng */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Lịch sử phòng
              </h3>
              <div className="space-y-2">
                {MOCK_ROOMS.map((room) => {
                  const persona = MENTOR_PERSONAS.find(
                    (p) => p.key === room.personaKey
                  )!;
                  const Icon = persona.icon;
                  return (
                    <button
                      key={room.id}
                      onClick={() => {
                        setActivePersona(persona);
                        setShowHistory(false);
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left hover:bg-muted/60 transition-colors"
                    >
                      <div
                        className={`w-7 h-7 rounded-full bg-gradient-to-br ${persona.color} flex items-center justify-center`}
                      >
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {room.topic}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {room.lastActive} · {room.messageCount} tin nhắn
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick actions cho mentor hiện tại */}
            <div className="p-4 border-t border-border">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Gợi ý nhanh
              </p>
              <div className="space-y-1.5">
                {activePersona.quickActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action.prompt)}
                    className="w-full text-left text-xs p-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-16 border-b border-border bg-card/60 px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {!showHistory && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(true)}
                className="h-8 w-8 p-0"
              >
                <Users className="w-4 h-4" />
              </Button>
            )}
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-full bg-gradient-to-br ${activePersona.color} flex items-center justify-center shadow-[0_0_18px_hsl(var(--primary)/0.3)]`}
              >
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-serif text-xl font-black">
                  {activePersona.name}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {activePersona.title} ·{" "}
                  <span className="text-emerald-400">
                    {MENTOR_ONLINE_LABEL}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>Phòng VIP — truy cập 24/7</span>
            </div>
            <Crown className="w-5 h-5 text-accent" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 ? (
            // Empty state
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col items-center justify-center text-center"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-6 shadow-[0_0_30px_hsl(var(--primary)/0.2)]">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-serif font-black mb-2">
                Chào mừng đến với Phòng Mentor AI
              </h3>
              <p className="text-muted-foreground max-w-md mb-6">
                {activePersona.greeting}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {activePersona.quickActions.map((action, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickAction(action.prompt)}
                    className="text-xs"
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </motion.div>
          ) : (
            messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "mentor" && (
                  <div
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${activePersona.color} flex items-center justify-center shrink-0`}
                  >
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[70%] ${
                    msg.role === "user" ? "text-right" : "text-left"
                  }`}
                >
                  <div
                    className={`inline-block p-4 rounded-2xl ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border"
                    }`}
                  >
                    {msg.role === "mentor" ? (
                      <MarkdownMessage content={msg.content} />
                    ) : (
                      <p className="text-sm leading-relaxed">
                        {msg.content}
                      </p>
                    )}
                  </div>
                  <div
                    className={`flex items-center gap-2 mt-1 text-xs text-muted-foreground ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>{msg.time}</span>
                    {msg.role === "mentor" && (
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="p-0.5 hover:text-foreground transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Gợi ý câu hỏi sau câu trả lời mentor */}
                  {msg.role === "mentor" && msg.suggestions && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleQuickAction(s)}
                          className="text-xs px-2.5 py-1 rounded-full bg-muted/40 hover:bg-muted/70 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary-foreground">
                      U
                    </span>
                  </div>
                )}
              </motion.div>
            ))
          )}

          {/* Typing indicator */}
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div
                className={`w-8 h-8 rounded-full bg-gradient-to-br ${activePersona.color} flex items-center justify-center`}
              >
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-card border border-border p-4 rounded-2xl">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border bg-card/60 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhập câu hỏi của em..."
                className="w-full px-4 py-3 pr-12 rounded-xl bg-background border border-border resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                rows={1}
                maxLength={2000}
                disabled={isTyping}
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isTyping}
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 rounded-full"
              >
                {isTyping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Nhấn Enter để gửi, Shift+Enter để xuống dòng
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
