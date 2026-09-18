"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Bot,
  Clock,
  MessageSquare,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Users,
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
  X,
  ArrowRight,
  Hand,
  MoreHorizontal,
  Settings,
  ScreenShare,
  ScreenShareOff,
  PhoneOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarkdownMessage } from "@/components/features/workspace/MarkdownMessage";
import { type MockMessage, extractContextSummary } from "@/lib/mock-ai-data";

/**
 * ─────────────────────────────────────────────────────────────
 *  MockRoomAI — Phòng chất vấn với Giám khảo AI
 *
 *  AI vào vai MỘT GIÁM KHẢO trong hội đồng bảo vệ: chủ động đặt câu hỏi,
 *  truy xét và phản biện về CHÍNH đồ án của sinh viên ( bám vào tài liệu
 *  được chọn làm ngữ cảnh), như một buổi bảo vệ thật. Hình thức trả lời
 *  vẫn là chat tự do (markdown, như ChatGPT / Gemini) — KHÔNG rubric,
 *  KHÔNG tiêu chí CLO, KHÔNG điểm số, KHÔNG JSON hay form cố định.
 *
 *  UI: giữ khung phòng (video grid, toolbar, sidebar chat) nhưng loại bỏ
 *  các yếu tố "hội đồng/hình thức chấm điểm" (nhiều persona giám khảo,
 *  phủ CLO, thẻ câu hỏi cố định, gợi ý soạn sẵn, báo cáo rubric mock).
 * ─────────────────────────────────────────────────────────────
 */

type Phase = "presentation" | "defense" | "feedback";

const PHASES: { key: Phase; label: string; minutes: number; desc: string }[] = [
  { key: "presentation", label: "Thuyết trình", minutes: 15, desc: "Trình bày đồ án của bạn" },
  { key: "defense", label: "Chất vấn", minutes: 10, desc: "Hội đồng AI sẽ hỏi bạn" },
  { key: "feedback", label: "Nhận xét", minutes: 5, desc: "Nhận đánh giá chi tiết" },
];

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function fmtElapsed(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function fmtPhase(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(sec)}`;
}

// Participants type (giống mock-room)
type Participant = { user_id: number; name: string; role: string };

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
  const [phase, setPhase] = useState<Phase>("presentation");
  const [timeLeft, setTimeLeft] = useState(PHASES[0].minutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);

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

  // Chat state
  const [messages, setMessages] = useState<MockMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Room controls (giống mock-room)
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "people">("chat");
  const [expandedTile, setExpandedTile] = useState<boolean>(false);

  // Participants (giống mock-room)
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Elapsed time (giống mock-room)
  const [elapsed, setElapsed] = useState(0);
  const joinedAtRef = useRef<number>(Date.now());

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<any>(null);
  const isIntentionalStopRef = useRef(false);
  // Context mới nhất cho các callback (STT/timer) — tránh closure cũ
  const stateRef = useRef<{ messages: MockMessage[]; context: string }>({
    messages: [],
    context: "",
  });
  stateRef.current = { messages, context: projectContext };

  // ── Timer ──────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || timeLeft <= 0) return;
    phaseTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          const nextIdx = phaseIdx + 1;
          if (nextIdx < PHASES.length) {
            setPhaseIdx(nextIdx);
            setPhase(PHASES[nextIdx].key);
            setTimeLeft(PHASES[nextIdx].minutes * 60);
          } else {
            setIsRunning(false);
            // Hết thời gian → Giám khảo AI chốt lại buổi chất vấn (không rubric)
            void askMentorRef.current(
              "Thời gian buổi bảo vệ đã kết thúc. Với vai giám khảo, hãy chốt lại buổi chất vấn hôm nay: " +
                "những vấn đề em đã trả lời tốt, những điểm em còn trả lời chưa thuyết phục " +
                "và gợi ý em cần chuẩn bị thêm gì. Viết tự nhiên như nhận xét của giám khảo, KHÔNG dùng " +
                "điểm số hay rubric."
            );
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
    };
  }, [isRunning, timeLeft, phaseIdx]);

  // ── Elapsed time ───────────────────────────────────────
  useEffect(() => {
    joinedAtRef.current = Date.now();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - joinedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

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

    setParticipants([
      { user_id: 1, name: "Bạn (Sinh viên)", role: "student" },
      { user_id: 100, name: "Giám khảo AI", role: "mentor" },
    ]);
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
  }, [selectedDocId, studentDocs, uploadedFile, loadDocContext]);

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
    // Cập nhật stateRef ngay để askMentor đọc được history đầy đủ
    setMessages((prev) => {
      const next = [...prev, userMsg];
      stateRef.current = { ...stateRef.current, messages: next };
      return next;
    });
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

  // ── Chuyển phase ───────────────────────────────────────
  const goToPhase = (target: Phase) => {
    const idx = PHASES.findIndex((p) => p.key === target);
    setPhase(target);
    setPhaseIdx(idx);
    setTimeLeft(PHASES[idx].minutes * 60);
    setIsRunning(false);
  };

  // ── Reset ──────────────────────────────────────────────
  const handleReset = () => {
    setPhase("presentation");
    setPhaseIdx(0);
    setTimeLeft(PHASES[0].minutes * 60);
    setIsRunning(false);
    setMessages([]);
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
              Vào phòng chất vấn — Giám khảo AI
            </h2>
            <p className="text-muted-foreground mb-6">
              Giám khảo AI vào vai thành viên hội đồng, truy vấn và phản biện về đồ án của bạn như một buổi bảo vệ thật — không chấm điểm, không form cố định.
              Bạn có thể chọn tài liệu đồ án để giám khảo bám sát nội dung (khuyên dùng), hoặc vào phòng chất vấn ngay.
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
          {/* Sub-Header (giống mock-room) */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/60 bg-[#0f0f0f]">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)] bg-green-500`}></span>
                <span className="text-xs font-bold tracking-wider text-gray-300">LIVE</span>
              </div>
              <div className="flex flex-col">
                <h2 className="text-sm font-semibold text-gray-100">Phòng bảo vệ đồ án — AI Mock Defense</h2>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                  <span className="flex items-center gap-1" title="Thời gian đã tham gia phòng">
                    <span className="inline-block w-3 h-3 rounded-full border border-gray-500 flex items-center justify-center text-[8px]">⏱</span>
                    {fmtElapsed(elapsed)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Chờ người tham gia...
                  </span>
                </div>
              </div>
            </div>

            {/* Phase countdown + controls (giống mock-room) */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-[#1A1A1A] px-3 py-1.5 rounded-full border border-gray-800">
                <Users className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-medium text-gray-300">{Math.max(participants.length, 1)} người trong phòng</span>
              </div>

              {/* Role badge */}
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border bg-teal-900/40 text-teal-300 border-teal-700/50`}
                title="Vai trò của bạn trong phòng"
              >
                🎓 Sinh viên
              </span>

              {/* Phase indicator */}
              <div className="flex items-center gap-2 bg-[#1A1A1A] px-3 py-1.5 rounded-full border border-gray-800">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">{PHASES[phaseIdx].label}</span>
                <span className="text-sm font-bold text-white tabular-nums">{fmtPhase(timeLeft)}</span>
              </div>

              {/* Phase controls */}
              <div className="flex items-center gap-1">
                {isRunning ? (
                  <button onClick={() => setIsRunning(false)} className="w-8 h-8 rounded-full bg-amber-500/20 hover:bg-amber-500/30 flex items-center justify-center text-amber-400 transition-colors" title="Tạm dừng">
                    <Pause className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={() => setIsRunning(true)} className="w-8 h-8 rounded-full bg-green-500/20 hover:bg-green-500/30 flex items-center justify-center text-green-400 transition-colors" title="Bắt đầu đếm ngược">
                    <Play className="w-4 h-4" />
                  </button>
                )}
                <button onClick={handleReset} className="w-8 h-8 rounded-full bg-[#202020] hover:bg-[#2A2A2A] flex items-center justify-center text-gray-300 transition-colors" title="Reset về giai đoạn 1">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              <button className="p-2 rounded-full hover:bg-gray-800 text-gray-400 transition-colors">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Workspace */}
          <div className="flex flex-1 overflow-hidden relative h-full">
            {/* Left Column (Video Grid + Captions + Bottom Toolbar) */}
            <div className="flex-1 flex flex-col p-4 relative h-full">
              {/* Phase stepper (giống mock-room) */}
              <div className="flex items-center gap-2 mb-4">
                {PHASES.map((p, i) => {
                  const active = i === phaseIdx;
                  const done = i < phaseIdx;
                  return (
                    <div key={p.key} className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setPhaseIdx(i);
                          setTimeLeft(PHASES[i].minutes * 60);
                          setIsRunning(false);
                          setPhase(p.key);
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          active
                            ? "bg-amber-500/20 border-amber-500 text-amber-300"
                            : done
                              ? "bg-teal-900/30 border-teal-800 text-teal-400"
                              : "bg-[#1A1A1A] border-gray-800 text-gray-400 hover:bg-[#202020]"
                        }`}
                        title={`Chuyển sang giai đoạn: ${p.label} (${p.minutes} phút)`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
                            done ? "bg-teal-500 text-white" : active ? "bg-amber-500 text-black" : "bg-gray-700 text-gray-300"
                          }`}
                        >
                          {done ? "✓" : i + 1}
                        </span>
                        {p.label}
                      </button>
                      {i < PHASES.length - 1 && <span className="text-gray-600">→</span>}
                    </div>
                  );
                })}
              </div>

              {/* Video Grid — render động theo participants */}
              <div className="flex-1 grid grid-cols-2 gap-4 pb-24 relative">
                {participants.length === 0 ? (
                  // Fallback: 2 thẻ mặc định (giống mock-room)
                  <>
                    {/* Card 1: Local (bạn) — mic / screen share */}
                    <div className="bg-[#121212] rounded-2xl border border-teal-900/40 relative overflow-hidden flex flex-col items-center justify-center group">
                      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-400 to-blue-600 flex items-center justify-center relative shadow-[0_0_50px_rgba(45,212,191,0.2)]">
                        <span className="text-5xl text-white opacity-90 drop-shadow-lg">🎓</span>
                      </div>
                      <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                        YOU
                      </div>
                      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                        <Mic className={`w-3.5 h-3.5 ${isRecording ? "text-red-400 animate-pulse" : "text-gray-500"}`} />
                        <span className="text-xs text-gray-300 font-medium">
                          {isRecording ? "Đang nghe..." : "Bạn"}
                        </span>
                      </div>
                    </div>
                    {/* Card 2: Remote peer (đối phương) */}
                    <div className="bg-[#121212] rounded-2xl border border-purple-900/30 relative overflow-hidden flex flex-col items-center justify-center group">
                      <div
                        className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center relative shadow-[0_0_50px_rgba(168,85,247,0.15)]"
                      >
                        <Bot className="w-10 h-10 text-white" />
                      </div>
                      <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                        PEER
                      </div>
                      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                        <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-xs text-gray-300 font-medium">
                          {isSpeaking ? "Đang trả lời..." : "Chờ đối phương..."}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  // Có presence → render 1 ô cho mỗi người
                  participants.map((p) => {
                    const isMe = p.user_id === 1;
                    const displayName = p.name;
                    const roleLabel = p.role === "mentor" ? "Giám khảo" : "Sinh viên";
                    const isMentor = p.role === "mentor";
                    const isExpanded = expandedTile === (p.user_id === 1);
                    return (
                      <div
                        key={p.user_id}
                        onClick={() => setExpandedTile(p.user_id === 1)}
                        className={`bg-[#121212] rounded-2xl border relative overflow-hidden flex flex-col items-center justify-center group ${
                          isMentor ? "border-purple-900/30" : "border-teal-900/40"
                        } ${p.user_id === 1 ? "cursor-pointer hover:ring-2 hover:ring-teal-500/50 transition-all" : ""} ${
                          isExpanded ? "hidden" : ""
                        }`}
                      >
                        {/* Avatar placeholder */}
                        <div className={`w-32 h-32 rounded-full flex items-center justify-center relative shadow-lg ${
                          isMentor
                            ? "bg-gradient-to-br from-purple-500 to-blue-500 shadow-[0_0_50px_rgba(168,85,247,0.15)]"
                            : "bg-gradient-to-br from-teal-400 to-blue-600 shadow-[0_0_50px_rgba(45,212,191,0.2)]"
                        }`}>
                          {isMe ? (
                            <span className="text-5xl text-white opacity-90 drop-shadow-lg">🎓</span>
                          ) : (
                            <Bot className="w-10 h-10 text-white" />
                          )}
                        </div>
                        <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                          {isMe ? "YOU" : "PEER"}
                        </div>
                        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                          <Mic className={`w-3.5 h-3.5 ${isMe ? (isRecording ? "text-red-400 animate-pulse" : "text-gray-500") : "text-purple-400"}`} />
                          <span className="text-xs text-gray-300 font-medium">
                            {isMe
                              ? (isRecording ? "Đang nghe..." : "Bạn")
                              : `${displayName} (${roleLabel})`}
                          </span>
                        </div>
                        {/* Maximize button */}
                        <div className="absolute top-4 left-4 bg-black/50 hover:bg-black/70 text-white/80 hover:text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 className="w-4 h-4" />
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Overlay phóng to */}
                {expandedTile && (
                  <div
                    className="col-span-2 row-span-2 bg-[#0A0A0A] rounded-2xl border border-teal-500/30 relative overflow-hidden flex flex-col items-center justify-center"
                    onClick={() => setExpandedTile(false)}
                  >
                    <div className="text-center">
                      <Bot className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Giám khảo AI</p>
                    </div>
                    <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                      GIÁM KHẢO AI
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedTile(false); }}
                      className="absolute top-4 left-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg transition-colors"
                      title="Thu nhỏ"
                    >
                      <Minimize2 className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Live Captions — nội dung Mentor AI nói gần nhất */}
              <div className="absolute bottom-4 left-0 right-0 px-4">
                <div className="bg-[#0f1513] border border-teal-900/50 rounded-xl p-4 shadow-xl backdrop-blur-md">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-teal-900/60 p-1 rounded text-teal-400">
                      <MessageSquare className="w-3 h-3" />
                    </div>
                    <span className="text-[10px] font-bold text-teal-500 tracking-wider uppercase">PHỤ ĐỀ TRỰC TIẾP — GIÁM KHẢO</span>
                  </div>
                  <p className="text-gray-200 text-sm font-medium leading-relaxed line-clamp-3">
                    {isTyping
                      ? "🤖 Giám khảo đang đặt câu hỏi..."
                      : [...messages].reverse().find((m) => m.role === "mentor")?.content?.replace(/\s+/g, " ").slice(0, 280) ||
                        "Phòng họp đã sẵn sàng. Giám khảo sẽ bắt đầu chất vấn về đồ án của bạn."}
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Toolbar (giống mock-room) */}
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-[#0A0A0A] border-t border-gray-800/40 flex items-center justify-between px-6 z-20">
              <div className="w-32"></div> {/* Spacer */}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (isRecording) stopSTT();
                    else startSTT();
                  }}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                    isRecording
                      ? "bg-teal-500/20 border border-teal-500 text-teal-400 animate-pulse"
                      : "bg-[#202020] hover:bg-[#2A2A2A] text-gray-300"
                  }`}
                  title={isRecording ? "Tắt mic & nhận dạng giọng nói" : "Bật mic & nhận dạng giọng nói (STT)"}
                >
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => setSharing(!sharing)}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                    sharing
                      ? "bg-blue-500/20 border border-blue-500 text-blue-400"
                      : "bg-[#202020] hover:bg-[#2A2A2A] text-gray-300"
                  }`}
                  title={sharing ? "Dừng chia sẻ" : "Chia sẻ màn hình"}
                >
                  {sharing ? <ScreenShareOff className="w-5 h-5" /> : <ScreenShare className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => setHandRaised(!handRaised)}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                    handRaised
                      ? "bg-amber-500/20 border border-amber-500 text-amber-400"
                      : "bg-[#202020] hover:bg-[#2A2A2A] text-gray-300"
                  }`}
                  title="Báo hỏi"
                >
                  <Hand className="w-5 h-5" />
                </button>
                <button className="w-11 h-11 rounded-full bg-[#202020] hover:bg-[#2A2A2A] flex items-center justify-center text-gray-300 transition-colors">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setActiveTab("chat")}
                  className="w-11 h-11 rounded-xl bg-teal-900/30 border border-teal-800/50 hover:bg-teal-900/50 flex items-center justify-center text-teal-400 transition-colors ml-2"
                  title="Mở trò chuyện"
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center justify-end w-32">
                <Button
                  onClick={() => setShowLeaveConfirm(true)}
                  className="bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-full px-6 h-10 font-semibold shadow-lg shadow-red-900/20"
                >
                  <PhoneOff className="w-4 h-4 mr-2" />
                  Rời phòng
                </Button>
              </div>
            </div>
          </div>

          {/* Right Sidebar (Chat + Q&A) — giống mock-room */}
          <div className="w-[380px] bg-[#0A0A0A] border-l border-gray-800/60 flex flex-col h-full">
            {/* Tabs (giống mock-room) */}
            <div className="flex border-b border-gray-800/60">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex-1 py-4 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                  activeTab === "chat"
                    ? "text-teal-400 border-b-2 border-teal-500"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                TRÒ CHUYỆN
              </button>
              <button
                onClick={() => setActiveTab("people")}
                className={`flex-1 py-4 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                  activeTab === "people"
                    ? "text-teal-400 border-b-2 border-teal-500"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Users className="w-4 h-4" />
                MỌI NGƯỜI ({participants.length})
              </button>
            </div>

            {/* Tab content */}
            {activeTab === "chat" && (
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
                          {isMine ? "Bạn" : <Bot className="w-4 h-4 text-white" />}
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
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center"
                      >
                        <Bot className="w-4 h-4 text-white" />
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
            )}

            {/* People tab (giống mock-room) */}
            {activeTab === "people" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Người có mặt trong phòng ({participants.length})
                </div>
                {participants.length === 0 && (
                  <div className="text-sm text-gray-500 text-center py-8">
                    Đang chờ mọi người tham gia...
                  </div>
                )}
                {participants.map((p) => {
                  const isMentor = p.role === "mentor";
                  const initials = p.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
                  return (
                    <div key={p.user_id} className="flex items-center gap-3 bg-gray-900/50 border border-gray-800/50 rounded-xl p-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border ${
                        isMentor ? "bg-purple-900/40 text-purple-300 border-purple-700/50" : "bg-teal-900/40 text-teal-300 border-teal-700/50"
                      }`}>
                        {isMentor ? <Bot className="w-4 h-4 text-white" /> : initials}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-gray-200">{p.name}</div>
                        <div className={`text-xs ${isMentor ? "text-purple-400" : "text-teal-400"}`}>
                          {isMentor ? "Giám khảo" : "Sinh viên"}
                        </div>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Chat Input (giống mock-room) */}
            {activeTab === "chat" && (
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
                    className="w-full bg-[#1A1A1A] border border-gray-700/50 rounded-full py-3 pl-4 pr-12 text-sm text-gray-200 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all placeholder:text-gray-600"
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
                    className="absolute right-1.5 top-1.5 w-9 h-9 rounded-full bg-teal-600 hover:bg-teal-500 flex items-center justify-center text-white transition-colors"
                  >
                    {isTyping ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 ml-0.5" />
                    )}
                  </button>
                </div>
              </div>
            )}
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
                  <div>
                    <label className="text-sm font-medium mb-2 block">Thời gian mỗi giai đoạn</label>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {PHASES.map((p, i) => (
                        <div key={p.key} className="text-center">
                          <div className="text-xs text-muted-foreground">{p.label}</div>
                          <div className="text-lg font-bold">{p.minutes}m</div>
                        </div>
                      ))}
                    </div>
                  </div>
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
