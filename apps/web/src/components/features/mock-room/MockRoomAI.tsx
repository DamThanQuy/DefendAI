"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  VolumeX,
  ArrowRight,
  PhoneOff,
  X,
  Bot,
  Plus,
  Search,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Edit2,
  Sparkles,
  Paperclip,
  RotateCcw,
  BookOpen,
  Award,
  ChevronDown,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarkdownMessage } from "@/components/features/workspace/MarkdownMessage";
import {
  MessageContentScroll,
  extractMessageSections,
} from "@/components/features/mock-room/MessageContentScroll";
import { type MockMessage, extractContextSummary } from "@/lib/mock-ai-data";
import { ChunkedUploader } from "@/lib/chunked-upload";
import { MAX_FILE_SIZE } from "@/lib/constants";

// File >= 4MB sẽ chuyển sang S3 multipart chunked upload trực tiếp lên MinIO để tránh giới hạn Vercel
const CHUNKED_THRESHOLD = 4 * 1024 * 1024;

type StudentDoc = {
  id: number;
  filename: string;
  file_type: string;
  doc_type: string;
  status: string;
  purpose: string;
  created_at: string;
};

type MockSession = {
  id: number;
  document_id: number | null;
  title: string;
  message_count: number;
  preview: string;
  created_at: string;
  updated_at: string;
};

type MockSessionDetail = {
  id: number;
  document_id: number | null;
  title: string;
  messages: { role: string; content: string; time?: string }[];
  created_at: string;
  updated_at: string;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("access_token");
  } catch {
    return null;
  }
}

// 4 gợi ý câu hỏi chất vấn mẫu giống ChatGPT
const STARTER_PROMPTS = [
  {
    icon: "🎯",
    title: "Chất vấn kiến trúc hệ thống",
    desc: "Đánh giá sự hợp lý của kiến trúc phần mềm, cơ sở dữ liệu và công nghệ lựa chọn.",
    prompt:
      "Thưa thầy/cô, xin mời hội đồng đặt câu hỏi chất vấn xoáy sâu vào kiến trúc hệ thống và lý do em lựa chọn công nghệ cho đồ án này.",
  },
  {
    icon: "❓",
    title: "5 câu hỏi hóc búa nhất",
    desc: "Giả lập các câu hỏi phản biện khó mà hội đồng thường dùng để thử thách sinh viên.",
    prompt:
      "Giả sử thầy/cô là giám khảo khó tính nhất trong hội đồng, hãy đặt ra 5 câu hỏi phản biện hóc búa nhất về tính khả thi và lỗ hổng của đồ án.",
  },
  {
    icon: "🔍",
    title: "Rà soát lỗ hổng bảo mật & hiệu năng",
    desc: "Phản biện khả năng chịu tải, bảo mật dữ liệu và phương án xử lý sự cố.",
    prompt:
      "Hãy chất vấn em về vấn đề bảo mật (Authentication, SQL Injection, Data Privacy) và bài toán chịu tải cao (Scalability, Caching) của hệ thống.",
  },
  {
    icon: "💡",
    title: "Hướng dẫn bảo vệ tự tin",
    desc: "Gợi ý mẹo trình bày slide, cách phản hồi khi chưa nắm chắc câu trả lời.",
    prompt:
      "Xin giám khảo cho em lời khuyên: Khi hội đồng hỏi vào phần em chưa kịp triển khai hoặc chưa nắm rõ, em nên trả lời như thế nào để ghi điểm tác phong?",
  },
];

export default function MockRoomAI() {
  const router = useRouter();

  // ── Document & Context State ──────────────────────────────
  const [studentDocs, setStudentDocs] = useState<StudentDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [projectContext, setProjectContext] = useState("");
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [showDocModal, setShowDocModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");

  // ── Session & Sidebar State ──────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<MockSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [searchSessionQuery, setSearchSessionQuery] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<number | null>(null);
  const [renameTitleInput, setRenameTitleInput] = useState("");

  // ── Chat & Interaction State ─────────────────────────────
  const [messages, setMessages] = useState<MockMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<number | null>(null);

  // ── Voice State ──────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);

  // ── Modal State ──────────────────────────────────────────
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [endingSession, setEndingSession] = useState(false);

  // ── Refs ─────────────────────────────────────────────────
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const isIntentionalStopRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stateRef = useRef<{ messages: MockMessage[]; context: string }>({
    messages: [],
    context: "",
  });
  stateRef.current = { messages, context: projectContext };

  const activeSessionRef = useRef<number | null>(null);
  activeSessionRef.current = activeSessionId;

  // ── Auto-scroll to bottom ────────────────────────────────
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isTyping, scrollToBottom]);

  // ── Auto-resize input textarea ───────────────────────────
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        180
      )}px`;
    }
  }, [input]);

  // ── Load student documents ───────────────────────────────
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

  // ── Load session list ────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setSessionsLoading(true);
    try {
      const r = await fetch("/api/mock-qa/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return;
      const data = await r.json();
      setSessions(data.items ?? []);
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const fetchSessionsRef = useRef<typeof fetchSessions | null>(null);
  fetchSessionsRef.current = fetchSessions;

  // ── Read document context text ───────────────────────────
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

  // ── Khi chọn tài liệu mới ────────────────────────────────
  const handleSelectDoc = async (docId: number) => {
    setSelectedDocId(docId);
    setContextLoading(true);
    setContextError("");
    try {
      const text = await loadDocContext(docId);
      setProjectContext(text);
      setShowDocModal(false);
    } catch (e: any) {
      setContextError(e.message || "Lỗi đọc ngữ cảnh tài liệu");
    } finally {
      setContextLoading(false);
    }
  };

  // ── File upload handler ──────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getToken();
    if (!token) {
      alert("Vui lòng đăng nhập để tải lên tài liệu.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setDocsError(
        `Tệp vượt quá ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB. Vui lòng chọn tệp nhỏ hơn.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setDocsError("");
    setContextLoading(true);
    setUploadProgress(0);
    setUploadStatusText("Đang tải lên...");

    try {
      let docId: number;

      if (file.size >= CHUNKED_THRESHOLD) {
        setUploadStatusText("Đang tải lên qua S3 Multipart...");
        const uploader = new ChunkedUploader(file, {
          concurrency: 3,
          onProgress: (uploaded, total) => {
            const pct = Math.round((uploaded / total) * 100);
            setUploadProgress(pct);
            setUploadStatusText(
              `Đang tải lên... ${(uploaded / 1024 / 1024).toFixed(1)}/${(
                total / 1024 / 1024
              ).toFixed(1)} MB (${pct}%)`
            );
          },
        });
        const result = await uploader.start();
        if (!result?.document_id) {
          throw new Error("Tải lên thất bại: không nhận được mã tài liệu");
        }
        docId = result.document_id;
      } else {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("purpose", "student_project");

        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
          headers: { Authorization: `Bearer ${token}` },
        });

        const text = await res.text();
        let data: any = {};
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Lỗi máy chủ (${res.status}): ${text.slice(0, 100)}`);
        }

        if (!res.ok) {
          throw new Error(data.detail || data.error || "Tải lên thất bại");
        }
        docId = data.documentId ?? data.id;
      }

      setUploadProgress(100);
      await fetchStudentDocs();
      await handleSelectDoc(docId);
    } catch (err: any) {
      setDocsError(err.message || "Tải lên thất bại");
    } finally {
      setContextLoading(false);
      setUploadProgress(0);
      setUploadStatusText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Tự động lưu phiên (Debounce 800ms) ───────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    const token = getToken();
    if (!token) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };
        const payload = {
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            time: m.time,
          })),
          document_id: projectContext ? selectedDocId : null,
        };

        let sid = activeSessionRef.current;
        if (sid == null) {
          const firstUser = messages.find((m) => m.role === "user");
          const r = await fetch("/api/mock-qa/sessions", {
            method: "POST",
            headers,
            body: JSON.stringify({
              document_id: payload.document_id,
              title: (firstUser?.content || "Phiên chất vấn").slice(0, 80),
            }),
          });
          if (!r.ok) return;
          const created = await r.json();
          sid = created.id;
          setActiveSessionId(sid);
          activeSessionRef.current = sid;
        }

        await fetch(`/api/mock-qa/sessions/${sid}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        });

        void fetchSessionsRef.current?.();
      } catch {
        // ignore
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [messages, projectContext, selectedDocId]);

  // ── Mở / Tiếp tục phiên chat cũ ──────────────────────────
  const resumeSession = useCallback(
    async (sessionId: number) => {
      const token = getToken();
      if (!token) return;
      setContextLoading(true);
      try {
        const r = await fetch(`/api/mock-qa/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new Error("Không tải được phiên chat");
        const data: MockSessionDetail = await r.json();

        let context = "";
        if (data.document_id) {
          try {
            context = await loadDocContext(data.document_id);
            setSelectedDocId(data.document_id);
          } catch {
            context = "";
          }
        }
        setProjectContext(context);

        const restored: MockMessage[] = data.messages.map((m, i) => ({
          id: Date.now() + i,
          role: m.role === "user" ? ("user" as const) : ("mentor" as const),
          content: m.content,
          time: m.time || "",
        }));

        setMessages(restored);
        setActiveSessionId(data.id);
        activeSessionRef.current = data.id;
        stateRef.current = { messages: restored, context };
      } catch (e: any) {
        alert(e.message || "Không thể tiếp tục phiên chat");
      } finally {
        setContextLoading(false);
      }
    },
    [loadDocContext]
  );

  // ── Xoá phiên chat ───────────────────────────────────────
  const deleteSession = useCallback(
    async (sessionId: number, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!confirm("Xoá phiên chat này? Hành động không thể hoàn tác.")) return;
      const token = getToken();
      if (!token) return;
      try {
        const r = await fetch(`/api/mock-qa/sessions/${sessionId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new Error("Xoá phiên thất bại");
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          startNewSession();
        }
      } catch (e: any) {
        alert(e.message || "Lỗi khi xoá phiên");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSessionId]
  );

  // ── Bắt đầu phiên mới (New chat) ─────────────────────────
  const startNewSession = useCallback(() => {
    setMessages([]);
    setActiveSessionId(null);
    activeSessionRef.current = null;
    setInput("");
    stateRef.current = { messages: [], context: projectContext };
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
  }, [projectContext]);

  // ── Gửi câu hỏi tới Mentor AI ─────────────────────────────
  const askMentor = useCallback(
    async (extraTurn?: string, opts?: { hidden?: boolean }) => {
      setIsTyping(true);
      const showTurn = !!extraTurn && !opts?.hidden;
      const token = getToken();
      if (!token) {
        const errMsg: MockMessage = {
          id: Date.now(),
          role: "mentor",
          content:
            "⚠️ Bạn chưa đăng nhập nên Giám khảo AI không thể phản hồi. Vui lòng đăng nhập lại.",
          time: new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        const next = [...stateRef.current.messages, errMsg];
        stateRef.current = { ...stateRef.current, messages: next };
        setMessages(next);
        setIsTyping(false);
        return;
      }

      const history = stateRef.current.messages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

      const lastHistory = history[history.length - 1];
      const msgs =
        extraTurn && lastHistory?.content !== extraTurn
          ? [...history, { role: "user" as const, content: extraTurn }]
          : history;

      try {
        const res = await fetch("/api/mock-qa/chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: msgs,
            context: stateRef.current.context,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.detail || data.message || data.error || "AI không phản hồi"
          );
        }

        const next = [...stateRef.current.messages];
        if (showTurn && next[next.length - 1]?.content !== extraTurn) {
          next.push({
            id: Date.now(),
            role: "user",
            content: extraTurn!,
            time: new Date().toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        }
        next.push({
          id: Date.now() + 1,
          role: "mentor",
          content: data.reply || "(Giám khảo AI không đưa ra phản hồi)",
          time: new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });

        stateRef.current = { ...stateRef.current, messages: next };
        setMessages(next);
      } catch (err: any) {
        const next = [...stateRef.current.messages];
        if (showTurn && next[next.length - 1]?.content !== extraTurn) {
          next.push({
            id: Date.now(),
            role: "user",
            content: extraTurn!,
            time: new Date().toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        }
        next.push({
          id: Date.now() + 1,
          role: "mentor",
          content: `⚠️ **Không thể kết nối Giám khảo AI**\n\n${
            err?.message || "Lỗi không xác định"
          }. Vui lòng thử lại.`,
          time: new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
        stateRef.current = { ...stateRef.current, messages: next };
        setMessages(next);
      } finally {
        setIsTyping(false);
      }
    },
    []
  );

  const sendMessage = useCallback(
    (overrideText?: string) => {
      const trimmed = (overrideText ?? input).trim();
      if (!trimmed || isTyping) return;

      if (isRecording && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsRecording(false);
      }

      const userMsg: MockMessage = {
        id: Date.now(),
        role: "user",
        content: trimmed,
        time: new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      const next = [...stateRef.current.messages, userMsg];
      stateRef.current = {
        ...stateRef.current,
        messages: next,
      };
      setMessages(next);
      setInput("");
      setIsTyping(true);
      void askMentor(trimmed);
    },
    [input, isTyping, isRecording, askMentor]
  );

  // ── Speech-to-Text (STT) ─────────────────────────────────
  const startSTT = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Trình duyệt không hỗ trợ nhận diện giọng nói (SpeechRecognition).");
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "vi-VN";

      recognition.onresult = (event: any) => {
        let fullTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript;
        }
        const text = fullTranscript.trim();
        if (text) {
          setInput(text);
        }
      };

      recognition.onerror = () => {
        setIsRecording(false);
      };

      recognition.onend = () => {
        if (!isIntentionalStopRef.current) {
          setIsRecording(false);
        }
      };

      recognitionRef.current = recognition;
      isIntentionalStopRef.current = false;
      recognition.start();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  }, []);

  const stopSTT = useCallback(() => {
    isIntentionalStopRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsRecording(false);
  }, []);

  // ── Text-to-Speech (Đọc to bằng giọng nói) ────────────────
  const toggleSpeak = (content: string, msgId: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Trình duyệt không hỗ trợ phát âm (SpeechSynthesis).");
      return;
    }

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = content
      .replace(/[*_~`#]/g, "")
      .replace(/^[-•*]\s+/gm, "")
      .slice(0, 1500);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "vi-VN";
    utterance.rate = 1.0;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  // ── Copy Message ─────────────────────────────────────────
  const copyToClipboard = (content: string, id: number) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Kết thúc phiên Mock AI & Chuyển sang Báo cáo ─────────
  const handleEndSession = async () => {
    const token = getToken();
    if (!token) return;
    setEndingSession(true);
    try {
      const res = await fetch("/api/mock-ai/end-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Kết thúc buổi thất bại");
      }
      setShowEndSessionConfirm(false);
      router.push("/report");
    } catch (err: any) {
      alert(`Lỗi: ${err.message || "Không thể kết thúc buổi"}`);
    } finally {
      setEndingSession(false);
    }
  };

  // Lọc danh sách phiên theo ô tìm kiếm
  const filteredSessions = useMemo(() => {
    if (!searchSessionQuery.trim()) return sessions;
    const q = searchSessionQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchSessionQuery]);

  const activeDocName = useMemo(() => {
    if (!selectedDocId) return null;
    return studentDocs.find((d) => d.id === selectedDocId)?.filename || `Tài liệu #${selectedDocId}`;
  }, [selectedDocId, studentDocs]);

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden relative">
      {/* ── Left Sidebar (ChatGPT Style Session History) ── */}
      <aside
        className={`h-full border-r border-border bg-card/60 backdrop-blur-md flex flex-col shrink-0 transition-all duration-300 z-30 ${
          sidebarOpen ? "w-72" : "w-0 -translate-x-full overflow-hidden border-r-0"
        }`}
      >
        <div className="p-3 border-b border-border/80 flex items-center justify-between gap-2">
          {/* Nút Tạo cuộc trò chuyện mới (+ New Chat) */}
          <button
            onClick={startNewSession}
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-background hover:bg-muted/80 text-xs font-semibold text-foreground shadow-sm transition-all hover:border-primary/50"
            title="Bắt đầu cuộc trò chuyện mới"
          >
            <Plus className="w-4 h-4 text-primary" />
            <span>Cuộc trò chuyện mới</span>
          </button>

          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Đóng thanh bên"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Ô tìm kiếm phiên */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm lịch sử đoạn chat..."
              value={searchSessionQuery}
              onChange={(e) => setSearchSessionQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-muted/40 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/70"
            />
          </div>
        </div>

        {/* Danh sách các phiên hội thoại */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1 custom-scrollbar">
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>Đang tải lịch sử...</span>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs text-muted-foreground">
              {searchSessionQuery ? "Không tìm thấy phiên phù hợp." : "Chưa có cuộc trò chuyện nào."}
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isActive = activeSessionId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => resumeSession(s.id)}
                  className={`group relative flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium border border-primary/20 shadow-sm"
                      : "text-foreground/80 hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <span className="truncate">{s.title || "Phiên phản biện"}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                    <button
                      onClick={(e) => deleteSession(s.id, e)}
                      className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                      title="Xoá phiên"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Thông tin tài liệu đang nạp ở đáy sidebar */}
        <div className="p-3 border-t border-border/80 bg-muted/20">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Tài liệu phản biện
            </span>
            <button
              onClick={() => setShowDocModal(true)}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              {activeDocName ? "Đổi tài liệu" : "Chọn tài liệu"}
            </button>
          </div>

          <div
            onClick={() => setShowDocModal(true)}
            className="flex items-center gap-2 p-2 rounded-xl bg-card border border-border/60 hover:border-primary/40 cursor-pointer transition-all shadow-sm group"
          >
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">
                {activeDocName || "Chưa gắn tài liệu đồ án"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {projectContext ? "Đã nạp nội dung (AI chất vấn sâu)" : "Bấm để nạp đồ án"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Chat Screen (ChatGPT Layout) ── */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Navigation Bar */}
        <header className="h-14 border-b border-border bg-card/70 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Mở thanh bên lịch sử"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex flex-col leading-none min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-bold text-foreground truncate">Mentor AI</h1>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground truncate">
                  Giám khảo phản biện đồ án
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Chip hiển thị tài liệu đã nạp */}
            {activeDocName && (
              <button
                onClick={() => setShowDocModal(true)}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-medium hover:bg-primary/15 transition-colors max-w-[200px] truncate"
                title="Bấm để xem hoặc đổi tài liệu"
              >
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate">{activeDocName}</span>
              </button>
            )}

            <button
              onClick={startNewSession}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>Phiên mới</span>
            </button>

            <button
              onClick={() => setShowEndSessionConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-xs font-bold transition-colors"
              title="Kết thúc và xem báo cáo đánh giá"
            >
              <Award className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Hoàn thành & Báo cáo</span>
            </button>

            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-destructive text-xs font-semibold transition-colors"
              title="Rời phòng"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* ── Chat Messages Scroll Area ── */}
        <div
          ref={chatScrollRef}
          className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar relative flex flex-col"
        >
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col space-y-6 pb-28">
            {/* Empty State / Welcome Screen giống ChatGPT */}
            {messages.length === 0 && (
              <div className="my-auto py-8 flex flex-col items-center justify-center text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/20 mb-4">
                  <Bot className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Chào bạn! Tôi là Mentor AI & Giám khảo phản biện đồ án.
                </h2>
                <p className="text-sm text-muted-foreground max-w-lg mb-8 leading-relaxed">
                  Tôi có thể rà soát lỗ hổng kiến trúc, chất vấn giải thuật, đặt câu hỏi hội đồng
                  và chỉ ra các mục bạn cần lưu ý để bảo vệ đồ án tự tin nhất.
                </p>

                {/* Grid 4 gợi ý câu hỏi chất vấn mẫu giống ChatGPT */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl text-left">
                  {STARTER_PROMPTS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(item.prompt)}
                      className="p-4 rounded-2xl border border-border/80 bg-card/60 hover:bg-card hover:border-primary/50 text-foreground transition-all flex flex-col gap-1.5 shadow-sm group hover:shadow-md"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{item.icon}</span>
                        <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                          {item.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {item.desc}
                      </p>
                    </button>
                  ))}
                </div>

                {!selectedDocId && (
                  <div className="mt-8">
                    <Button
                      variant="outline"
                      onClick={() => setShowDocModal(true)}
                      className="rounded-xl border-dashed border-primary/50 text-xs font-semibold text-primary hover:bg-primary/5"
                    >
                      <Paperclip className="w-3.5 h-3.5 mr-1.5" />
                      Gắn tài liệu đồ án để Giám khảo AI chất vấn sát thực tế
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Danh sách các lượt chat (Turns) */}
            {messages.map((msg, index) => {
              const isMine = msg.role === "user";
              // Lấy câu hỏi user tương ứng cho lượt trả lời của AI
              const prevUserMsg = !isMine && index > 0 && messages[index - 1]?.role === "user"
                ? messages[index - 1]
                : undefined;

              return (
                <div
                  key={msg.id || index}
                  id={`turn-${msg.id || index}`}
                  className={`w-full flex ${isMine ? "justify-end" : "justify-start"} animate-in fade-in duration-200`}
                >
                  {/* Tin nhắn của USER (Sinh viên) — Đặt bên phải, bo tròn thanh thoát */}
                  {isMine ? (
                    <div className="flex flex-col items-end max-w-[85%] sm:max-w-[75%]">
                      <div className="px-4 py-3 rounded-2xl rounded-tr-sm bg-muted/80 text-foreground border border-border/60 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
                        {msg.content}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground px-1">
                        <span>Bạn</span>
                        {msg.time && <span>· {msg.time}</span>}
                      </div>
                    </div>
                  ) : (
                    /* Tin nhắn của AI MENTOR — Căn lề trái, KÈM THANH CONTENT SCROLL BÊN CẠNH */
                    <div className="relative group/turn flex items-start gap-3 sm:gap-4 w-full">
                      {/* ── THANH CONTENT SCROLL BÊN CẠNH (Sticky bên cạnh nội dung cho mỗi câu hỏi) ── */}
                      <div className="sticky top-6 shrink-0 z-10 flex flex-col items-center">
                        <MessageContentScroll
                          content={msg.content}
                          messageId={msg.id}
                          scrollContainerRef={chatScrollRef}
                          turnPrompt={prevUserMsg?.content}
                          onScrollToPrompt={() => {
                            if (prevUserMsg) {
                              const el = document.getElementById(`turn-${prevUserMsg.id}`);
                              el?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }
                          }}
                        />
                      </div>

                      {/* Khung nội dung câu trả lời của AI */}
                      <div className="flex-1 min-w-0 bg-card/60 hover:bg-card/85 border border-border/70 rounded-2xl p-5 sm:p-6 shadow-sm transition-colors">
                        {/* Header của phản hồi AI */}
                        <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-teal-500 to-indigo-600 flex items-center justify-center text-white text-[11px] font-bold shadow-sm">
                              AI
                            </div>
                            <span className="text-xs font-bold text-foreground">Giám khảo AI</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium hidden sm:inline">
                              Hội đồng phản biện
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            {msg.time && <span className="mr-1">{msg.time}</span>}
                          </div>
                        </div>

                        {/* Nội dung Markdown chính của câu trả lời */}
                        <div className="text-sm leading-relaxed text-foreground">
                          <MarkdownMessage content={msg.content} messageId={msg.id} />
                        </div>

                        {/* Footer công cụ tương tác: Copy, Đọc to, Thử lại */}
                        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => copyToClipboard(msg.content, msg.id)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Sao chép toàn bộ câu trả lời"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="text-emerald-500 font-medium">Đã sao chép</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Sao chép</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => toggleSpeak(msg.content, msg.id)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                                speakingMsgId === msg.id
                                  ? "bg-primary/20 text-primary font-semibold"
                                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
                              }`}
                              title={speakingMsgId === msg.id ? "Dừng đọc" : "Đọc to câu trả lời"}
                            >
                              {speakingMsgId === msg.id ? (
                                <>
                                  <VolumeX className="w-3.5 h-3.5 text-primary animate-pulse" />
                                  <span>Dừng đọc</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span>Đọc to</span>
                                </>
                              )}
                            </button>
                          </div>

                          {prevUserMsg && (
                            <button
                              onClick={() => {
                                const userText = prevUserMsg.content;
                                sendMessage(userText);
                              }}
                              disabled={isTyping}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                              title="Yêu cầu AI phản biện lại câu hỏi này"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Phản biện lại</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Typing Indicator khi AI đang phản hồi */}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 w-full"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-card/80 border border-border p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    Giám khảo AI đang phân tích và chuẩn bị câu hỏi...
                  </span>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Bottom Floating Input Bar (ChatGPT Prompt Capsule) ── */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none z-20">
          <div className="max-w-4xl mx-auto w-full pointer-events-auto">
            {isRecording && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 font-medium animate-pulse w-fit">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Đang nghe giọng nói của bạn... Hãy nói trực tiếp câu trả lời vào micro.
              </div>
            )}

            {/* Hộp nhập liệu Capsule giống ChatGPT */}
            <div className="relative flex items-end gap-2 bg-card/90 border border-border/80 rounded-[26px] p-2 sm:p-2.5 shadow-xl backdrop-blur-md focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              {/* Nút gắn tài liệu */}
              <button
                type="button"
                onClick={() => setShowDocModal(true)}
                className={`p-2 rounded-full transition-colors shrink-0 ${
                  selectedDocId
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                title={activeDocName ? `Tài liệu: ${activeDocName}` : "Gắn tài liệu đồ án"}
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Nút Micro STT */}
              <button
                type="button"
                onClick={isRecording ? stopSTT : startSTT}
                className={`p-2 rounded-full transition-all shrink-0 ${
                  isRecording
                    ? "bg-rose-500/20 text-rose-400 animate-pulse border border-rose-500/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                title={isRecording ? "Dừng ghi âm" : "Nói câu trả lời bằng giọng nói"}
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Ô textarea tự dãn dòng */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Nhập câu trả lời hoặc câu hỏi bảo vệ đồ án... (Shift + Enter để xuống dòng)"
                className="flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 text-sm text-foreground placeholder:text-muted-foreground resize-none py-2 px-1 max-h-[180px] custom-scrollbar"
              />

              {/* Nút Gửi (Send Button) */}
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={!input.trim() || isTyping}
                className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary text-primary-foreground flex items-center justify-center transition-all shadow-sm shrink-0"
                title="Gửi câu hỏi (Enter)"
              >
                {isTyping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 ml-0.5" />
                )}
              </button>
            </div>

            {/* Dòng Disclaimer ở đáy giống ChatGPT */}
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Mentor AI có thể đưa ra câu trả lời chưa hoàn hảo. Hãy luôn đối chiếu với tài liệu đồ án chính thức của bạn.
            </p>
          </div>
        </div>
      </div>

      {/* ── Modal Quản lý / Chọn Tài liệu đồ án ── */}
      <AnimatePresence>
        {showDocModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <h3 className="text-base font-bold text-foreground">
                    Tài liệu phản biện đồ án
                  </h3>
                </div>
                <button
                  onClick={() => setShowDocModal(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                Chọn tài liệu báo cáo để Giám khảo AI đọc toàn văn và đặt các câu hỏi xoáy sâu vào
                đồ án của bạn.
              </p>

              {/* Tải lên tài liệu mới */}
              <div className="mb-4">
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-border hover:border-primary/50 rounded-xl cursor-pointer bg-muted/20 hover:bg-muted/40 transition-all">
                  <Upload className="w-6 h-6 text-primary mb-1.5" />
                  <span className="text-xs font-semibold text-foreground">
                    Tải lên tài liệu mới (PDF, DOCX, ZIP)
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    Hỗ trợ file lớn qua S3 Multipart
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.zip"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {uploadStatusText && (
                  <div className="mt-2 text-xs text-primary flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{uploadStatusText}</span>
                  </div>
                )}
              </div>

              {/* Danh sách tài liệu đã có */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar mb-4">
                {docsLoading ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    Đang tải danh sách tài liệu...
                  </div>
                ) : studentDocs.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    Chưa có tài liệu nào được tải lên.
                  </div>
                ) : (
                  studentDocs.map((doc) => {
                    const isSelected = selectedDocId === doc.id;
                    return (
                      <div
                        key={doc.id}
                        onClick={() => handleSelectDoc(doc.id)}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? "bg-primary/10 border-primary text-primary font-semibold"
                            : "bg-muted/30 border-border hover:bg-muted/60 text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="w-4 h-4 shrink-0" />
                          <span className="text-xs truncate">{doc.filename}</span>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedDocId(null);
                    setProjectContext("");
                    setShowDocModal(false);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Không dùng tài liệu (Hỏi tự do)
                </Button>

                <Button
                  size="sm"
                  onClick={() => setShowDocModal(false)}
                  className="text-xs rounded-xl"
                >
                  Đóng
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal Xác nhận Thoát ── */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-[420px] max-w-[95vw] shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                  <PhoneOff className="w-5 h-5 text-destructive" />
                </div>
                <h3 className="text-base font-bold text-foreground">Rời khỏi phòng Mock AI?</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                Phiên chat hiện tại đã được tự động lưu. Bạn có thể mở lại bất kỳ lúc nào từ thanh bên lịch sử.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 rounded-xl text-xs h-10 font-semibold"
                >
                  Ở lại phòng
                </Button>
                <Button
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    router.push("/mock-room");
                  }}
                  className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl text-xs h-10 font-semibold shadow-md"
                >
                  Rời phòng
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal Hoàn thành & Tạo Báo cáo ── */}
      <AnimatePresence>
        {showEndSessionConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-[440px] max-w-[95vw] shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-teal-500/15 flex items-center justify-center">
                  <Award className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Kết thúc buổi phản biện?</h3>
                  <p className="text-xs text-muted-foreground">Tạo báo cáo đánh giá năng lực</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                Hệ thống sẽ tổng hợp toàn bộ các câu trả lời của bạn, chấm điểm phản biện và tạo
                báo cáo chi tiết các điểm mạnh, điểm yếu để bạn hoàn thiện trước hội đồng chính thức.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowEndSessionConfirm(false)}
                  className="flex-1 rounded-xl text-xs h-10 font-semibold"
                >
                  Tiếp tục hỏi đáp
                </Button>
                <Button
                  onClick={handleEndSession}
                  disabled={endingSession}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs h-10 font-semibold shadow-md"
                >
                  {endingSession ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Đang tạo báo cáo...
                    </>
                  ) : (
                    "Tạo báo cáo ngay"
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
