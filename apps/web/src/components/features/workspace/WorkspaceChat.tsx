"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONAS } from "@/lib/constants";

export interface WorkspaceChatItem {
  id: number;
  workspace_id: number;
  conversation_id?: string | null;
  question: string;
  answer: string | null;
  citations: string[] | null;
  persona: string;
  status: string;
  error: string | null;
  created_at: string;
}

interface ConversationItem {
  conversation_id: string;
  name: string;
  turn_count: number;
  last_message_at?: string | null;
}

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

// Key lưu trạng thái thu gọn sidebar theo từng user (email unique) — sống sót qua logout/login.
function sidebarStorageKey(): string {
  let email = "";
  try {
    email = (JSON.parse(localStorage.getItem("user") || "{}") as { email?: string }).email ?? "";
  } catch { /* ignore */ }
  return `chat_sidebar_collapsed_${email}`;
}

/**
 * Khung chat đề tài (toàn workspace) — R7.
 * Tách riêng để tái sử dụng: nhận workspaceId + persona mặc định, tự quản lý
 * history, streaming và auto-scroll.
 */
export default function WorkspaceChat({
  workspaceId,
  defaultPersona = "theory",
}: {
  workspaceId: number;
  defaultPersona?: string;
}) {
  const [chatItems, setChatItems] = useState<WorkspaceChatItem[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatPersona, setChatPersona] = useState(defaultPersona);
  const [chatRunning, setChatRunning] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const streamingIdRef = useRef<number | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>(""); // "" = đoạn mặc định
  const [convLoading, setConvLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuConvId, setMenuConvId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Ước lượng context token của đoạn đang mở (char/4 ≈ token) so với trần ~12k.
  const CONTEXT_MAX = 12000;
  const contextTokens = Math.round(
    chatItems.reduce((sum, t) => sum + (t.question.length + (t.answer?.length || 0)), 0) / 4
  );
  const contextPct = Math.min(100, Math.round((contextTokens / CONTEXT_MAX) * 100));

  // Khôi phục trạng thái sidebar từ localStorage (theo user) khi mount.
  useEffect(() => {
    setSidebarOpen(localStorage.getItem(sidebarStorageKey()) !== "1");
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      localStorage.setItem(sidebarStorageKey(), prev ? "1" : "0");
      return !prev;
    });
  };

  const scrollToBottom = () => {
    const el = chatScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  // Auto-scroll xuống cuối khi có message mới / streaming.
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatItems, chatRunning]);

  // Theo dõi vị trí cuộn: hiện nút "↓" khi user cuộn lên khỏi đáy.
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      setShowScrollDown(!atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Tự tải history khi mount (component tái sử dụng, không dựa vào parent giữ state)
  useEffect(() => {
    loadConversations();
    loadChatHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const loadConversations = async () => {
    const token = getToken();
    if (!token) return;
    setConvLoading(true);
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json();
        setConversations(data ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setConvLoading(false);
    }
  };

  const createConversation = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/chat/conversations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Đoạn mới" }),
      });
      if (!r.ok) throw new Error("Không tạo được đoạn chat");
      const data = await r.json();
      setActiveConvId(data.conversation_id);
      setChatItems([]);
      // Thêm trực tiếp vào list (conversation chưa có message nên backend GROUP BY
      // chưa trả về) — nếu không, sidebar không hiện đoạn mới cho tới khi có tin nhắn.
      setConversations((prev) => [
        { conversation_id: data.conversation_id, name: data.name || "Đoạn mới", turn_count: 0, last_message_at: null },
        ...prev,
      ]);
    } catch (e: any) {
      setChatError(e.message);
    }
  };

  const deleteConversation = async (convId: string) => {
    const token = getToken();
    if (!token) return;
    if (!window.confirm("Xoá đoạn chat này? Toàn bộ tin nhắn trong đoạn sẽ bị xoá.")) return;
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/chat/conversations/${convId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Không xoá được đoạn chat");
      if (activeConvId === convId) {
        setActiveConvId("");
        setChatItems([]);
        loadChatHistory();
      }
      await loadConversations();
    } catch (e: any) {
      setChatError(e.message);
    }
  };

  const switchConversation = (convId: string) => {
    setActiveConvId(convId);
    setChatItems([]);
    setChatError("");
    loadChatHistory(convId);
  };

  const startRename = (c: ConversationItem) => {
    setRenamingId(c.conversation_id);
    setRenameValue(c.name);
    setMenuConvId(null);
  };

  const submitRename = async (convId: string) => {
    const name = renameValue.trim();
    if (!name) return;
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/chat/conversations/${convId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error("Không đổi được tên");
      setConversations((prev) =>
        prev.map((c) => (c.conversation_id === convId ? { ...c, name } : c))
      );
    } catch (e: any) {
      setChatError(e.message);
    } finally {
      setRenamingId(null);
    }
  };

  const loadChatHistory = async (convId?: string) => {
    const token = getToken();
    if (!token) return;
    setChatLoading(true);
    setChatError("");
    try {
      const q = convId !== undefined ? `?conversation_id=${encodeURIComponent(convId)}` : "";
      const r = await fetch(`/api/workspaces/${workspaceId}/chat${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Không thể tải lịch sử chat");
      const data = await r.json();
      setChatItems((prev) => {
        // Server trả mới → cũ (created_at.desc()), đảo lại để state là cũ → mới
        // → render map() tự nhiên, tin nhắn mới nhất nằm dưới cùng (chuẩn chat).
        const list: WorkspaceChatItem[] = (data ?? []).reverse();
        // Merge thay vì overwrite: giữ các turn local (optimistic/streaming) chưa
        // có trong server list. Trước đây nếu fetch resolve sau khi stream xong
        // (streamingIdRef = null) thì list cũ (fetch lúc row chưa tạo) overwrite
        // mất turn vừa gửi → UI không hiển thị prompt/answer cho tới khi F5.
        const byId = new Map(list.map((b) => [b.id, b]));
        prev.forEach((t) => {
          if (!byId.has(t.id)) byId.set(t.id, t);
        });
        return Array.from(byId.values());
      });
    } catch (e: any) {
      setChatError(e.message);
    } finally {
      setChatLoading(false);
    }
  };

  const sendChatQuestion = async () => {
    const trimmed = chatQuestion.trim();
    if (!trimmed || chatRunning) return;
    const token = getToken();
    if (!token) return;
    setChatRunning(true);
    setChatError("");
    setChatQuestion("");

    // Append optimistic message user — hiện ngay, không chờ job
    const tempId = Date.now();
    streamingIdRef.current = tempId;
    setChatItems((prev) => [
      ...prev,
      {
        id: tempId,
        workspace_id: workspaceId,
        question: trimmed,
        answer: "",
        citations: [],
        persona: chatPersona,
        status: "processing",
        error: null,
        created_at: new Date().toISOString(),
      },
    ]);

    const done = () => {
      streamingIdRef.current = null;
      setChatRunning(false);
    };
    try {
      // AbortController + watchdog chống kẹt: nếu 30s không nhận frame nào (server
      // treo / mất kết nối mà stream không đóng) thì hủy — trước đây reader.read()
      // treo vĩnh viễn làm chatRunning kẹt true → các câu hỏi sau bị nuốt lặng lẽ.
      const controller = new AbortController();
      const r = await fetch(`/api/workspaces/${workspaceId}/chat/stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: trimmed, persona: chatPersona, conversation_id: activeConvId || null }),
        signal: controller.signal,
      });
      if (!r.ok || !r.body) throw new Error("Không kết nối được luồng trả lời");

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let errored = "";
      let ended = false;
      let lastFrame = Date.now();
      const idleTimer = setInterval(() => {
        if (Date.now() - lastFrame > 30000) controller.abort();
      }, 5000);
      try {
        while (true) {
          const { done: rd, value } = await reader.read();
          if (rd) {
            break;
          }
          lastFrame = Date.now();
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            let evt: any;
            try {
              evt = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            const cur = streamingIdRef.current;
            if (!cur) {
              break;
            }
            if (evt.type === "meta" && evt.chat_id) {
              // Đổi id item từ tempId → chat_id để delta/done sau map trúng turn này
              streamingIdRef.current = evt.chat_id;
              setChatItems((prev) =>
                prev.map((t) => (t.id === tempId ? { ...t, id: evt.chat_id } : t))
              );
            } else if (evt.type === "delta") {
              const id = streamingIdRef.current;
              setChatItems((prev) =>
                prev.map((t) => (t.id === id ? { ...t, answer: (t.answer || "") + evt.text } : t))
              );
            } else if (evt.type === "done") {
              const id = streamingIdRef.current;
              setChatItems((prev) =>
                prev.map((t) =>
                  t.id === id
                    ? { ...t, answer: evt.answer || t.answer, citations: evt.citations || [], status: "completed" }
                    : t
                )
              );
              ended = true;
              done();
            } else if (evt.type === "error") {
              // Đánh dấu failed ngay (không chờ stream kết thúc) — tránh UI kẹt
              // "AI đang suy nghĩ..." trong khoảng trống giữa error frame và khi
              // đọc hết stream.
              errored = evt.message || "Trả lời thất bại.";
              const id = streamingIdRef.current;
              setChatItems((prev) =>
                prev.map((t) =>
                  t.id === id ? { ...t, status: "failed", answer: evt.answer || t.answer, error: errored } : t
                )
              );
              ended = true;
              done();
            }
          }
        }
      } finally {
        clearInterval(idleTimer);
      }
      if (!ended && streamingIdRef.current !== null) {
        // Hết stream mà chưa done/error → mất kết nối giữa chừng
        const id = streamingIdRef.current;
        setChatItems((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: "failed", error: errored || "Mất kết nối khi đang trả lời." } : t))
        );
        done();
      }
    } catch (e: any) {
      const id = streamingIdRef.current;
      if (id !== null) {
        const aborted = e?.name === "AbortError";
        setChatItems((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, status: "failed", error: aborted ? "Hết thời gian chờ phản hồi từ AI (không nhận dữ liệu trong 30s). Hãy thử lại." : e.message }
              : t
          )
        );
        if (aborted) setChatError("");
      } else {
        setChatError(e.message);
      }
      done();
    }
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden flex flex-col h-[calc(100vh-340px)] min-h-[450px]">
      <div className="px-4 py-3 border-b border-border/60 bg-muted/40 flex items-center justify-between gap-2 sticky top-0 z-20">
        <span className="text-[13px] font-bold text-foreground">💬 Chat đề tài (toàn workspace)</span>
        <div className="flex items-center gap-3">
          {/* Circular progress: ước lượng context token của đoạn đang mở */}
          <div className="flex items-center gap-2" title={`Context: ~${contextTokens} / ${CONTEXT_MAX} tokens`}>
            <svg width="26" height="26" viewBox="0 0 36 36" className="shrink-0">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(39 39 42)" strokeWidth="4" />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke={contextPct >= 90 ? "rgb(248 113 113)" : "rgb(45 212 191)"}
                strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${(contextPct / 100) * 94.2} 94.2`}
                transform="rotate(-90 18 18)"
              />
            </svg>
            <span className="text-[11px] text-muted-foreground tabular-nums">{contextPct}%</span>
          </div>
          <div className="flex items-center gap-2">
          <select
            value={chatPersona}
            onChange={(e) => setChatPersona(e.target.value)}
            className="px-2.5 py-1.5 bg-card border border-border rounded-lg text-[12px] text-foreground focus:outline-none focus:border-primary"
          >
            {PERSONAS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={toggleSidebar}
            title={sidebarOpen ? "Thu gọn danh sách đoạn" : "Mở danh sách đoạn"}
            className="px-2.5 py-1.5 bg-card border border-border rounded-lg text-[12px] text-foreground hover:bg-muted hover:text-white transition-colors"
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar đoạn chat — thu gọn được, trạng thái lưu theo user */}
        {sidebarOpen && (
        <div className="w-44 shrink-0 border-r border-border/60 bg-card/40 flex flex-col h-full min-h-0">
          {/* Top bar cố định: tiêu đề + nút tạo đoạn mới (không trôi khi cuộn list) */}
          <div className="shrink-0 px-2 pt-2 pb-2 border-b border-border/60 flex items-center justify-between gap-1">
            <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Đoạn chat</p>
            <button
              onClick={createConversation}
              title="Tạo đoạn chat mới"
              className="px-2 py-1 bg-card border border-border rounded-md text-[11px] text-foreground hover:bg-muted hover:text-white transition-colors whitespace-nowrap"
            >
              ➕ Đoạn mới
            </button>
          </div>
          {/* Danh sách đoạn chat — cuộn độc lập, không làm trôi top bar */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1">
          {convLoading ? (
            <p className="text-muted-foreground text-[11px] px-2 py-1">Đang tải...</p>
          ) : (
            <>
              <button
                onClick={() => switchConversation("")}
                className={`w-full text-left px-2 py-1.5 rounded-md text-[12px] transition-colors ${activeConvId === "" ? "bg-teal-500/10 text-teal-400 font-semibold" : "text-muted-foreground hover:bg-muted/60"}`}
              >
                💬 Đoạn mặc định
              </button>
              {conversations.map((c) => (
                <div key={c.conversation_id} className="group relative flex items-center gap-1">
                  {renamingId === c.conversation_id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => submitRename(c.conversation_id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(c.conversation_id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="flex-1 px-2 py-1.5 bg-card border border-primary rounded-md text-[12px] text-foreground focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => switchConversation(c.conversation_id)}
                      className={`flex-1 text-left px-2 py-1.5 rounded-md text-[12px] truncate transition-colors ${activeConvId === c.conversation_id ? "bg-teal-500/10 text-teal-400 font-semibold" : "text-muted-foreground hover:bg-muted/60"}`}
                    >
                      {c.name}
                    </button>
                  )}
                  {renamingId !== c.conversation_id && (
                    <button
                      onClick={() => setMenuConvId((prev) => (prev === c.conversation_id ? null : c.conversation_id))}
                      title="Tuỳ chọn đoạn"
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground text-[14px] leading-none px-1 transition-opacity"
                    >
                      ⋮
                    </button>
                  )}
                  {menuConvId === c.conversation_id && (
                    <div className="absolute right-0 top-7 z-10 w-28 bg-card border border-border rounded-lg shadow-lg py-1 text-[12px]">
                      <button
                        onClick={() => startRename(c)}
                        className="w-full text-left px-3 py-1.5 text-foreground hover:bg-muted transition-colors"
                      >
                        ✏️ Đổi tên
                      </button>
                      <button
                        onClick={() => {
                          setMenuConvId(null);
                          deleteConversation(c.conversation_id);
                        }}
                        className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        🗑 Xoá đoạn
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
          </div>
        </div>
        )}

        <div className="relative flex-1 min-h-0">
      <div ref={chatScrollRef} className="absolute inset-0 overflow-y-auto p-5 flex flex-col gap-4 custom-scrollbar">
        {chatLoading ? (
          <p className="text-muted-foreground text-[13px] text-center py-8">Đang tải hội thoại...</p>
        ) : chatItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <span className="text-4xl mb-3">💬</span>
            <p className="text-[13px] text-center max-w-[320px]">Hỏi bất kỳ điều gì về toàn bộ workspace — AI trả lời kèm nguồn file:đoạn, giữ ngữ cảnh 6 lượt trước.</p>
          </div>
        ) : (
          chatItems.map((turn) => (
            <div key={turn.id} className="flex flex-col gap-2">
              <div className="self-end max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">
                {turn.question}
              </div>
              {turn.status === "completed" && turn.answer ? (
                <div className="self-start max-w-[85%] bg-muted/70 border border-border/50 rounded-2xl rounded-bl-md px-4 py-2.5">
                  <div className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{turn.answer}</div>
                  {turn.citations && turn.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {turn.citations.map((c, i) => (
                        <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-semibold rounded-md">📎 {c}</span>
                      ))}
                    </div>
                  )}
                </div>
              ) : turn.status === "failed" ? (
                <div className="self-start max-w-[85%] bg-red-500/10 border border-red-500/20 rounded-2xl rounded-bl-md px-4 py-2.5 text-red-400 text-[13px]">
                  {turn.answer && <div className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap mb-2">{turn.answer}</div>}
                  {turn.error || "Trả lời thất bại."}
                </div>
              ) : (
                <div className="self-start max-w-[85%] bg-muted/40 border border-border/40 rounded-2xl rounded-bl-md px-4 py-2.5">
                  {turn.answer ? (
                    <div className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{turn.answer}</div>
                  ) : (
                    <div className="flex items-center gap-2.5 text-muted-foreground text-[13px]">
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                      </span>
                      AI đang suy nghĩ...
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          aria-label="Cuộn xuống tin nhắn mới nhất"
          className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-muted border border-border text-foreground shadow-lg flex items-center justify-center hover:bg-muted hover:text-white transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="m19 12-7 7-7-7" />
          </svg>
        </button>
      )}
      </div>
      </div>

      {chatError && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-red-400 text-[12px]">{chatError}</div>
      )}

      <div className="px-4 py-3 border-t border-border/60 flex gap-3">
        <input
          value={chatQuestion}
          onChange={(e) => setChatQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendChatQuestion()}
          placeholder="Hỏi về workspace..."
          className="flex-1 px-4 py-2.5 bg-card border border-border rounded-xl text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
        <button
          onClick={sendChatQuestion}
          disabled={!chatQuestion.trim() || chatRunning}
          className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-[14px] font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {chatRunning ? "..." : "Gửi"}
        </button>
      </div>
    </div>
  );
}