"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Copy,
  Check,
  Upload,
  Mic,
  MicOff,
  Volume2,
  Download,
  Maximize2,
  Minimize2,
  ArrowRight,
  Hand,
  MoreHorizontal,
  Settings,
  ScreenShare,
  ScreenShareOff,
  PhoneOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarkdownMessage } from "@/components/features/workspace/MarkdownMessage";
import { type MockMessage, extractContextSummary } from "@/lib/mock-ai-data";

/**
 * ─────────────────────────────────────────────────────────────
 *  MockRoomAI — Phòng chat với AI (Giám khảo AI)
 *
 *  AI vào vai Giám khảo AI: chủ động đặt câu hỏi, truy vấn và phản biện
 *  về đồ án của sinh viên (bám vào tài liệu được chọn làm ngữ cảnh).
 *  Hình thức trả lời là chat tự do (markdown, như ChatGPT / Gemini).
 * ─────────────────────────────────────────────────────────────
 */

// Tài liệu đã upload của student (từ /api/documents/)
type StudentDoc = {
  id: number;
  filename: string;
  file_type: string;
  doc_type: string;
  status: string;
  purpose: string;
  created_at: string;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("access_token");
  } catch {
    return null;
  }
}

export default function MockRoomAI() {
  const router = useRouter();
  // ── State ──────────────────────────────────────────────
  // Workflow steps — "upload" (tuỳ chọn) → "room" (chất vấn với Giám khảo AI)
  const [step, setStep] = useState<"upload" | "room">("upload");
  const [projectContext, setProjectContext] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Tài liệu đã upload của student (từ server) — ngữ cảnh TUỲ CHỌN cho AI
  const [studentDocs, setStudentDocs] = useState<StudentDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");

  // Lịch sử chat đã lưu trên server — khôi phục khi vào lại phòng
  const [savedHistory, setSavedHistory] = useState<{
    messages: MockMessage[];
    document_id: number | null;
  } | null>(null);

  // Chat state
  const [messages, setMessages] = useState<MockMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Room controls
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const isIntentionalStopRef = useRef(false);
  // Timer debounce lưu lịch sử chat lên server
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Context mới nhất cho callback STT — tránh closure cũ
  const stateRef = useRef<{ messages: MockMessage[]; context: string }>({
    messages: [],
    context: "",
  });
  stateRef.current = { messages, context: projectContext };

  // ── Auto-scroll ────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // ── Load danh sách tài liệu student đã upload ─────────
  const fetchStudentDocs = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setDocsLoading(true);
    setDocsError("");
    try {
      const r = await fetch("/api/documents/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Không tải được danh sách tài liệu");
      const data = await r.json();
      const items: StudentDoc[] = (data.items ?? []).filter(
        (d: StudentDoc) => d.purpose !== "staff_reference"
      );
      setStudentDocs(items);
      // Auto chọn tài liệu mới nhất nếu chưa chọn
      if (items.length > 0 && selectedDocId === null) {
        setSelectedDocId(items[0].id);
      }
    } catch (e: any) {
      setDocsError(e.message || "Lỗi khi tải danh sách tài liệu");
    } finally {
      setDocsLoading(false);
    }
  }, [selectedDocId]);

  useEffect(() => {
    fetchStudentDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tải lịch sử chat đã lưu trên server (khi mở trang) ──
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/mock-qa/history", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const restored: MockMessage[] = (data.messages ?? []).map(
          (m: { role: string; content: string; time?: string }, i: number) => ({
            id: Date.now() + i,
            role: m.role === "user" ? ("user" as const) : ("mentor" as const),
            content: m.content,
            time: m.time || "",
          })
        );
        if (restored.length > 0) {
          setSavedHistory({
            messages: restored,
            document_id: data.document_id ?? null,
          });
        }
      })
      .catch(() => {});
  }, []);

  // ── Tự lưu lịch sử chat lên server (debounce 800ms sau mỗi tin) ──
  useEffect(() => {
    if (step !== "room" || messages.length === 0) return;
    const token = getToken();
    if (!token) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch("/api/mock-qa/history", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            time: m.time,
          })),
          document_id: projectContext ? selectedDocId : null,
        }),
      }).catch(() => {}); // lưu thất bại không chặn chat — thử lại ở lần tin sau
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [messages, step, projectContext, selectedDocId]);

  // ── Bắt đầu phiên mới — xoá lịch sử chat đã lưu ────────
  const clearHistory = useCallback(async () => {
    const token = getToken();
    if (token) {
      try {
        await fetch("/api/mock-qa/history", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    setSavedHistory(null);
    setMessages([]);
    stateRef.current = { messages: [], context: "" };
  }, []);

  // ── Lấy nội dung text đã trích xuất của tài liệu được chọn ──
  const loadDocContext = useCallback(async (docId: number): Promise<string> => {
    const token = getToken();
    if (!token) return "";
    const r = await fetch(`/api/documents/${docId}/text?max_chars=20000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const raw = await r.json();
    if (!r.ok) {
      throw new Error(raw.detail || raw.error || "Không thể đọc nội dung tài liệu");
    }
    return (raw.text ?? "").trim();
  }, []);

  // ── File upload handler (upload lên server qua API) ────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getToken();
    if (!token) {
      alert("Vui lòng đăng nhập để tải lên tài liệu.");
      return;
    }
    setUploadedFile(file);
    setDocsError("");
    setContextLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", "student_project");
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Tải lên thất bại");
      }
      // Upload xong → refresh danh sách + chọn tài liệu mới
      await fetchStudentDocs();
      setSelectedDocId(data.id);
      setProjectContext("");
    } catch (err: any) {
      setDocsError(err.message || "Tải lên thất bại");
      setUploadedFile(null);
    } finally {
      setContextLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Vào phòng chat (tài liệu là TUỲ CHỌN, không bắt buộc) ──
  const enterRoom = useCallback(async (useDoc: boolean) => {
    // ── Khôi phục lịch sử chat đã lưu: tiếp tục phiên trước ──
    if (savedHistory && savedHistory.messages.length > 0) {
      let context = "";
      const histDocId = savedHistory.document_id;
      if (histDocId) {
        setContextLoading(true);
        setContextError("");
        try {
          context = await loadDocContext(histDocId);
          setSelectedDocId(histDocId);
        } catch {
          context = ""; // tài liệu cũ có thể đã bị xoá — vẫn khôi phục chat
        } finally {
          setContextLoading(false);
        }
      }
      setProjectContext(context);
      setStep("room");
      setMessages(savedHistory.messages);
      // Đồng bộ stateRef NGAY để askMentor đọc đúng history vừa khôi phục
      stateRef.current = { messages: savedHistory.messages, context };
      return;
    }

    let context = "";
    if (useDoc && selectedDocId) {
      setContextLoading(true);
      setContextError("");
      try {
        context = await loadDocContext(selectedDocId);
      } catch (e: any) {
        setContextError(e.message || "Không thể đọc nội dung tài liệu");
        context = "";
      } finally {
        setContextLoading(false);
      }
    }
    setProjectContext(context);

    const docName = context
      ? studentDocs.find((d) => d.id === selectedDocId)?.filename ||
        uploadedFile?.name ||
        "đồ án"
      : null;

    setStep("room");

    const intro = context
      ? `Chào em. Tôi là **giám khảo** phụ trách buổi bảo vệ hôm nay. Tôi đã xem tài liệu "${docName}" của em:\n\n> ${extractContextSummary(context)}\n\nBuổi chất vấn bắt đầu ngay — em hãy sẵn sàng trả lời câu hỏi đầu tiên.`
      : `Chào em. Tôi là **giám khảo** phụ trách buổi bảo vệ hôm nay.\n\nEm hãy giới thiệu ngắn về đồ án của mình — tôi sẽ chất vấn trực tiếp về dự án.`;

    const introMsg: MockMessage = {
      id: Date.now(),
      role: "mentor",
      content: intro,
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([introMsg]);
    // Đồng bộ stateRef NGAY — askMentor bên dưới đọc từ đây, còn setState mới
    // có hiệu lực sau lần render kế tiếp.
    stateRef.current = { messages: [introMsg], context };

    // Giám khảo tự mở lời bằng câu hỏi chất vấn đầu tiên (lượt mồi ẩn,
    // không hiển thị bong bóng tin nhắn của sinh viên).
    void askMentorRef.current(
      context
        ? "(Buổi bảo vệ bắt đầu. Em vừa ngồi xuống và sẵn sàng. Hãy mở đầu với đúng vai giám khảo: chào ngắn, vào thẳng vấn đề và đặt CÂU HỎI CHẤT VẤN ĐẦU TIÊN về đồ án trong tài liệu — cụ thể, không chung chung, kết thúc bằng câu hỏi.)"
        : "(Buổi bảo vệ bắt đầu, chưa có tài liệu đính kèm. Hãy mở đầu với đúng vai giám khảo: yêu cầu sinh viên giới thiệu đồ án trong 2 phút, rồi đặt ngay câu hỏi chất vấn đầu tiên.)",
      { hidden: true }
    );
  }, [selectedDocId, studentDocs, uploadedFile, loadDocContext, savedHistory]);

  // ── Gọi Mentor AI (backend /api/mock-qa/chat) ──────────
  // Nhận thêm một lượt của sinh viên → gửi toàn bộ history + context tài liệu
  // lên backend → nhận câu trả lời tự do (markdown).
  const askMentor = useCallback(
    async (extraTurn?: string, opts?: { hidden?: boolean }) => {
      setIsTyping(true);
      // hidden: gửi extraTurn xuống backend nhưng không hiển thị bong bóng sinh viên
      const showTurn = !!extraTurn && !opts?.hidden;
      const token = getToken();
      if (!token) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "mentor",
            content: "⚠️ Bạn chưa đăng nhập nên Giám khảo AI không thể trả lời. Vui lòng đăng nhập lại.",
            time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        setIsTyping(false);
        return;
      }

      const history = stateRef.current.messages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));
      const msgs = extraTurn ? [...history, { role: "user" as const, content: extraTurn }] : history;

      try {
        const res = await fetch("/api/mock-qa/chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages: msgs, context: stateRef.current.context }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || data.message || data.error || "AI không phản hồi");
        }
        setMessages((prev) => {
          const next = [...prev];
          if (showTurn) {
            next.push({
              id: Date.now(),
              role: "user",
              content: extraTurn!,
              time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
            });
          }
          next.push({
            id: Date.now() + 1,
            role: "mentor",
            content: data.reply || "(AI trả lời rỗng)",
            time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
          });
          return next;
        });
      } catch (err: any) {
        setMessages((prev) => {
          const next = [...prev];
          if (showTurn) {
            next.push({
              id: Date.now(),
              role: "user",
              content: extraTurn!,
              time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
            });
          }
          next.push({
            id: Date.now() + 1,
            role: "mentor",
            content: `⚠️ **Không thể kết nối Giám khảo AI**\n\n${err?.message || "Lỗi không xác định"}. Vui lòng thử lại.`,
            time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
          });
          return next;
        });
      } finally {
        setIsTyping(false);
      }
    },
    []
  );
  // Ref để timer/STT callback luôn gọi được bản mới nhất
  const askMentorRef = useRef(askMentor);
  askMentorRef.current = askMentor;

  // ── Gửi tin nhắn ───────────────────────────────────────
  const sendMessage = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    const userMsg: MockMessage = {
      id: Date.now(),
      role: "user",
      content: trimmed,
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
    };
    // Cập nhật stateRef NGAY (đồng bộ) trước khi gọi askMentor
    // vì setMessages updater chạy lazily khi React render, không phải ngay
    stateRef.current = {
      ...stateRef.current,
      messages: [...stateRef.current.messages, userMsg],
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    void askMentor();
  }, [input, isTyping, askMentor]);

  // ── Quick action ───────────────────────────────────────
  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  // ── Copy message ───────────────────────────────────────
  const copyToClipboard = (content: string, id: number) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Kết thúc buổi Mock AI ───────────────────────────────
  const handleEndSession = async () => {
    if (!confirm("Bạn có chắc chắn muốn kết thúc buổi Mock AI? Sau khi kết thúc, buổi sẽ được đánh giá và báo cáo sẽ được tạo.")) {
      return;
    }

    const token = getToken();
    if (!token) {
      alert("Vui lòng đăng nhập để kết thúc buổi.");
      return;
    }

    try {
      const res = await fetch("/api/mock-ai/end-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Kết thúc buổi thất bại");
      }

      alert("Kết thúc buổi Mock AI thành công! Báo cáo đã được tạo.");
      router.push("/report");
    } catch (err: any) {
      alert(`Lỗi: ${err.message || "Không thể kết thúc buổi"}`);
    }
  };

  // ── STT ────────────────────────────────────────────────
  const startSTT = () => {
    if (!recognitionRef.current) return;
    isIntentionalStopRef.current = false;
    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start STT", err);
    }
  };

  const stopSTT = () => {
    if (recognitionRef.current) {
      isIntentionalStopRef.current = true;
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsRecording(false);
  };

  // Speech recognition setup
  useEffect(() => {
    if (typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "vi-VN";

      recognition.onresult = async (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        if (transcript) {
          const userMsg: MockMessage = {
            id: Date.now(),
            role: "user",
            content: transcript,
            time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
          };
          setMessages((prev) => {
            const next = [...prev, userMsg];
            stateRef.current = { ...stateRef.current, messages: next };
            return next;
          });
          setIsTyping(true);
          void askMentorRef.current();
        }
      };

      recognition.onend = () => {
        if (!isIntentionalStopRef.current) {
          try { recognition.start(); } catch (e) {}
        } else {
          setIsRecording(false);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          isIntentionalStopRef.current = true;
          setIsRecording(false);
        }
      };

      recognitionRef.current = recognition;
    }
    return () => {
      if (recognitionRef.current) {
        isIntentionalStopRef.current = true;
        recognitionRef.current.stop();
      }
    };
  }, []);

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0A0A0A] text-white font-sans overflow-hidden">
      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 flex items-center justify-center p-8 overflow-y-auto"
        >
          <Card className="max-w-2xl w-full p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_hsl(var(--primary)/0.2)]">
              <Upload className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-serif font-black mb-3">
              Vào phòng chat với Giám khảo AI
            </h2>
            <p className="text-muted-foreground mb-6">
              AI vào vai Giám khảo, truy vấn và phản biện về đồ án của bạn như một buổi bảo vệ thật — không chấm điểm, không form cố định.
              Bạn có thể chọn tài liệu đồ án để AI bám sát nội dung (khuyên dùng), hoặc vào phòng chat ngay.
            </p>

            {/* Danh sách tài liệu student đã upload */}
            <div className="mb-6 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground">Tài liệu đã tải lên</span>
                <button
                  onClick={fetchStudentDocs}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  ↻ Làm mới
                </button>
              </div>

              {docsLoading && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang tải danh sách tài liệu...
                </div>
              )}

              {!docsLoading && docsError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{docsError}</span>
                </div>
              )}

              {!docsLoading && !docsError && studentDocs.length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-xl">
                  Bạn chưa có tài liệu nào. Hãy tải lên file đầu tiên bên dưới.
                </div>
              )}

              {!docsLoading && studentDocs.length > 0 && (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {studentDocs.map((doc) => {
                    const isSelected = selectedDocId === doc.id;
                    return (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/30 bg-muted/10"
                        }`}
                      >
                        <FileText className={`w-5 h-5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.doc_type.toUpperCase()} · {new Date(doc.created_at).toLocaleString("vi-VN")}
                          </p>
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Upload file mới */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all mb-4"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.zip,.rar,.md"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">
                {contextLoading ? "Đang tải lên..." : "Hoặc tải lên tài liệu mới"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Hỗ trợ: PDF, Word, PowerPoint, ZIP, RAR (tối đa 10MB)
              </p>
            </div>

            {uploadedFile && !contextLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-4 bg-muted/30 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">{uploadedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {contextError && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-left">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{contextError}</span>
              </div>
            )}

            {/* Lịch sử chat đã lưu — tiếp tục phiên trước */}
            {savedHistory && savedHistory.messages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-teal-500/10 border border-teal-500/30 rounded-xl text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-teal-300">
                        Có {savedHistory.messages.length} tin nhắn từ phiên trước
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Vào phòng sẽ tiếp tục đúng đoạn chat cũ — tài liệu được lưu kèm.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearHistory}
                    className="text-xs text-gray-400 hover:text-red-400 underline shrink-0 transition-colors"
                    title="Xoá lịch sử và bắt đầu phiên chat mới"
                  >
                    Phiên mới
                  </button>
                </div>
              </motion.div>
            )}

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => enterRoom(true)}
                disabled={!selectedDocId || contextLoading}
                className="w-full h-12 text-lg font-bold rounded-xl"
              >
                {contextLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Đang đọc tài liệu...
                  </>
                ) : (
                  <>
                    Dùng tài liệu đã chọn & vào phòng
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => enterRoom(false)}
                disabled={contextLoading}
                className="w-full h-11 rounded-xl"
              >
                Vào phòng hỏi tự do (không cần tài liệu)
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ── Step 2: Phòng chat với Mentor AI ── */}
      {step === "room" && (
        <>
          {/* Header phòng chat + nút Thoát */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/60 bg-[#0f0f0f]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.7)]"></span>
              <h2 className="text-sm font-semibold text-gray-100">Phòng chat với Giám khảo AI</h2>
            </div>
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold transition-colors"
              title="Thoát khỏi phòng chat"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              Thoát
            </button>
          </div>

          {/* Main Workspace — chat thuần, không meeting UI */}
          <div className="flex flex-1 overflow-hidden relative h-full">
          {/* Right Sidebar (Chat) */}
          <div className="flex-1 bg-[#0A0A0A] border-l border-gray-800/60 flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                <div className="flex items-center gap-4">
                  <div className="h-px bg-gray-800 flex-1"></div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Phiên chất vấn — Giám khảo AI</span>
                  <div className="h-px bg-gray-800 flex-1"></div>
                </div>

                {/* Uploaded Document Summary (mentor AI đã đọc) */}
                {selectedDocId && projectContext && (
                  <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-teal-400" />
                      <span className="text-xs font-bold text-teal-400">TÀI LIỆU ĐÃ TẢI LÊN</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      {studentDocs.find((d) => d.id === selectedDocId)?.filename || uploadedFile?.name || "Tài liệu"}
                    </p>
                    <p className="text-xs text-gray-500 line-clamp-3">
                      {extractContextSummary(projectContext)}
                    </p>
                    <div className="mt-2 text-[10px] text-gray-600">
                      Giám khảo AI đã đọc tài liệu và sẽ bám vào đó khi chất vấn
                    </div>
                  </div>
                )}

                {/* Messages (giống mock-room) */}
                <div className="space-y-4">
                  {messages.map((msg, index) => {
                    const isMine = msg.role === "user";
                    const isStudent = msg.role === "user";
                    const avatarColor = isStudent
                      ? "bg-teal-900/60 text-teal-300 border-teal-800/50"
                      : "bg-blue-600 text-white border-blue-600";

                    return (
                      <div key={msg.id || index} className={`flex gap-3 ${isMine ? "flex-row-reverse" : ""}`}>
                        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm mt-1 border ${avatarColor}`}>
                          {isMine ? "Bạn" : "Giám khảo AI"}
                        </div>
                        <div className={`flex-1 ${isMine ? "text-right" : ""}`}>
                          <div className={`flex items-baseline gap-2 mb-1 ${isMine ? "flex-row-reverse" : ""}`}>
                            <span className="text-sm font-semibold text-gray-200">{isMine ? "Bạn" : "Giám khảo AI"}</span>
                            {msg.time && (
                              <span className="text-xs text-gray-500">
                                {msg.time}
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-sm leading-relaxed inline-block rounded-2xl px-3 py-2 ${
                              isMine
                                ? "bg-teal-600/20 text-teal-100 border border-teal-700/40"
                                : "bg-gray-800/60 text-gray-300"
                            }`}
                          >
                            {msg.role === "mentor" ? (
                              <MarkdownMessage content={msg.content} />
                            ) : (
                              <p className="text-sm leading-relaxed">{msg.content}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  {isTyping && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3"
                    >
                      <div
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold"
                      >
                        AI
                      </div>
                      <div className="bg-gray-800/60 border border-gray-700/50 p-3 rounded-2xl">
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div ref={messagesEndRef} />
              </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-gray-800/60">
                {isRecording && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-red-400">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    Đang nghe... giọng nói của bạn được ghi lại thành văn bản tự động
                  </div>
                )}
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Gửi câu trả lời hoặc tin nhắn..."
                    className="w-full bg-[#1A1A1A] border border-gray-700/50 rounded-full py-3 pl-4 pr-12 text-sm text-gray-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-gray-600"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || isTyping}
                    className="absolute right-1.5 top-1.5 w-9 h-9 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center text-white transition-colors"
                  >
                    {isTyping ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 ml-0.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Settings Modal ── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md"
            >
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-serif font-bold">Cài đặt phòng</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)} className="h-8 w-8 p-0">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Bật STT</span>
                    <button
                      onClick={() => {
                        if (isRecording) stopSTT();
                        else startSTT();
                      }}
                      className="w-11 h-6 rounded-full bg-primary/30 relative transition-colors"
                    >
                      <span className="absolute inset-0 flex items-center justify-center text-xs">
                        {isRecording ? "BẬT" : "TẮT"}
                      </span>
                    </button>
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <Button onClick={() => setShowSettings(false)}>
                    Đóng
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Leave Confirm Modal ── */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1A1A1A] border border-gray-700/60 rounded-2xl p-6 w-[400px] max-w-[90vw] shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <PhoneOff className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-100">Rời phòng Mock Room AI?</h3>
              </div>
              <p className="text-sm text-gray-400 mb-6">
                Bạn có chắc chắn muốn rời khỏi phòng? Mọi tiến trình sẽ bị dừng lại.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 bg-[#202020] hover:bg-[#2A2A2A] text-gray-300 rounded-xl h-11 font-semibold transition-colors"
                >
                  Ở lại
                </Button>
                <Button
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    router.push("/mock-room");
                  }}
                  className="flex-1 bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl h-11 font-semibold shadow-lg shadow-red-900/20 transition-colors"
                >
                  Xác nhận rời
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
