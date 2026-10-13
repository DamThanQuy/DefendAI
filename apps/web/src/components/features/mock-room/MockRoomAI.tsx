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
import { ChunkedUploader } from "@/lib/chunked-upload";
import { MAX_FILE_SIZE } from "@/lib/constants";

// File >= 4MB sẽ chuyển sang S3 multipart chunked upload trực tiếp lên MinIO để tránh giới hạn 4.5MB của Vercel
const CHUNKED_THRESHOLD = 4 * 1024 * 1024;

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

// Phiên chat đã lưu (GET /api/mock-qa/sessions)
type MockSession = {
  id: number;
  document_id: number | null;
  title: string;
  message_count: number;
  preview: string;
  created_at: string;
  updated_at: string;
};

// Chi tiết 1 phiên khi xem lại (GET /api/mock-qa/sessions/{id})
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");

  // Danh sách phiên chat đã lưu — xem lại / tiếp tục theo từng tài liệu
  const [sessions, setSessions] = useState<MockSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  // Phiên đang active trong phòng (null = chưa có, sẽ tạo khi autosave)
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  // Modal xem lại 1 phiên cũ (chỉ đọc)
  const [viewSession, setViewSession] = useState<MockSessionDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");

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

  // ── Tải danh sách phiên chat đã lưu (khi mở trang) ──────
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
      // tải thất bại không chặn UI
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Refresh danh sách phiên mỗi khi quay về màn hình chọn tài liệu
  useEffect(() => {
    if (step === "upload") void fetchSessions();
  }, [step, fetchSessions]);

  // ── Tự lưu phiên chat lên server (debounce 800ms sau mỗi tin) ──
  // Nếu chưa có phiên active → tạo mới (POST) rồi lưu vào phiên đó (PUT),
  // KHÔNG còn ghi đè toàn cục như cơ chế /history cũ.
  const activeSessionRef = useRef<number | null>(null);
  activeSessionRef.current = activeSessionId;
  // Ref để callback trong timeout gọi được fetchSessions mới nhất
  const fetchSessionsRef = useRef<typeof fetchSessions | null>(null);
  fetchSessionsRef.current = fetchSessions;

  useEffect(() => {
    if (step !== "room" || messages.length === 0) return;
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
          // Tạo phiên mới — tiêu đề lấy từ tin nhắn user đầu tiên
          const firstUser = messages.find((m) => m.role === "user");
          const r = await fetch("/api/mock-qa/sessions", {
            method: "POST",
            headers,
            body: JSON.stringify({
              document_id: payload.document_id,
              title: (firstUser?.content || "Phiên chất vấn").slice(0, 100),
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
        // Refresh danh sách ở màn hình chọn file (fetchSessions khi quay lại)
        void fetchSessionsRef.current?.();
      } catch {
        // lưu thất bại không chặn chat — thử lại ở lần tin sau
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [messages, step, projectContext, selectedDocId]);

  // ── Bắt đầu phiên mới — không xoá dữ liệu cũ, chỉ reset phiên active ──
  const clearHistory = useCallback(async () => {
    setMessages([]);
    setActiveSessionId(null);
    activeSessionRef.current = null;
    stateRef.current = { messages: [], context: "" };
    // Danh sách các phiên cũ vẫn giữ nguyên để xem lại sau
    void fetchSessions();
  }, [fetchSessions]);

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

  // ── File upload handler (hỗ trợ cả chunked upload cho file lớn > 4MB) ────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = getToken();
    if (!token) {
      alert("Vui lòng đăng nhập để tải lên tài liệu.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setDocsError(`Tệp vượt quá ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB. Vui lòng chọn tệp nhỏ hơn.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadedFile(file);
    setDocsError("");
    setContextLoading(true);
    setUploadProgress(0);
    setUploadStatusText("Đang chuẩn bị tải lên...");

    try {
      let docId: number;

      if (file.size >= CHUNKED_THRESHOLD) {
        // File lớn (>= 4MB, kể cả ZIP vài GB): dùng S3 multipart chunked upload trực tiếp MinIO
        setUploadStatusText("Đang tải lên qua S3 Multipart...");
        const uploader = new ChunkedUploader(file, {
          concurrency: 3,
          onProgress: (uploaded, total) => {
            const pct = Math.round((uploaded / total) * 100);
            setUploadProgress(pct);
            setUploadStatusText(
              `Đang tải lên... ${(uploaded / 1024 / 1024).toFixed(1)}/${(total / 1024 / 1024).toFixed(1)} MB (${pct}%)`
            );
          },
        });
        const result = await uploader.start();
        if (!result?.document_id) {
          throw new Error("Tải lên thất bại: không nhận được mã tài liệu");
        }
        docId = result.document_id;
      } else {
        // File nhỏ (< 4MB): upload trực tiếp qua BFF
        setUploadStatusText("Đang tải lên...");
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
          if (res.status === 413) {
            throw new Error("Tệp vượt quá giới hạn tải trực tiếp của máy chủ (4MB). Vui lòng thử lại.");
          }
          throw new Error(`Lỗi máy chủ (${res.status}): ${text.slice(0, 100)}`);
        }

        if (!res.ok) {
          throw new Error(data.detail || data.error || data.message || `Tải lên thất bại (HTTP ${res.status})`);
        }

        docId = data.documentId ?? data.id;
        if (!docId) {
          throw new Error("Không nhận được mã tài liệu từ máy chủ");
        }
      }

      // Upload xong → refresh danh sách + chọn tài liệu mới
      setUploadProgress(100);
      setUploadStatusText("Tải lên thành công!");
      await fetchStudentDocs();
      setSelectedDocId(docId);
      setProjectContext("");
    } catch (err: any) {
      setDocsError(err.message || "Tải lên thất bại");
      setUploadedFile(null);
    } finally {
      setContextLoading(false);
      setUploadProgress(0);
      setUploadStatusText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Xem lại 1 phiên cũ (chỉ đọc, không tiếp tục chat) ──
  const openSessionView = useCallback(async (sessionId: number) => {
    const token = getToken();
    if (!token) return;
    setViewLoading(true);
    try {
      const r = await fetch(`/api/mock-qa/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Không tải được phiên chat");
      const data: MockSessionDetail = await r.json();
      setViewSession(data);
    } catch (e: any) {
      alert(e.message || "Lỗi khi mở phiên chat");
    } finally {
      setViewLoading(false);
    }
  }, []);

  // ── Tiếp tục 1 phiên cũ — nạp messages + document_id vào phòng ──
  const resumeSession = useCallback(
    async (sessionId: number) => {
      const token = getToken();
      if (!token) return;
      setContextLoading(true);
      setContextError("");
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
            context = ""; // tài liệu cũ có thể đã bị xoá — vẫn khôi phục chat
          }
        }
        setProjectContext(context);

        const restored: MockMessage[] = data.messages.map((m, i) => ({
          id: Date.now() + i,
          role: m.role === "user" ? ("user" as const) : ("mentor" as const),
          content: m.content,
          time: m.time || "",
        }));

        setViewSession(null);
        setStep("room");
        setMessages(restored);
        setActiveSessionId(data.id);
        activeSessionRef.current = data.id;
        // Đồng bộ stateRef NGAY để askMentor đọc đúng history vừa khôi phục
        stateRef.current = { messages: restored, context };
      } catch (e: any) {
        setContextError(e.message || "Không thể tiếp tục phiên chat");
      } finally {
        setContextLoading(false);
      }
    },
    [loadDocContext]
  );

  // ── Xoá 1 phiên khỏi danh sách ─────────────────────────
  const deleteSession = useCallback(
    async (sessionId: number) => {
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
          setActiveSessionId(null);
          activeSessionRef.current = null;
        }
      } catch (e: any) {
        alert(e.message || "Lỗi khi xoá phiên");
      }
    },
    [activeSessionId]
  );

  // ── Vào phòng chat MỚI (tài liệu là TUỲ CHỌN, không bắt buộc) ──
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

    // Phiên mới hoàn toàn — autosave sẽ tạo session mới
    setActiveSessionId(null);
    activeSessionRef.current = null;

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
    <div className="flex flex-col h-full bg-background text-foreground font-sans overflow-hidden">
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
              onClick={() => !contextLoading && fileInputRef.current?.click()}
              className={`border-2 border-dashed border-border rounded-xl p-6 transition-all mb-4 ${
                contextLoading
                  ? "opacity-90 cursor-wait bg-muted/10 border-primary/40"
                  : "cursor-pointer hover:border-primary/40 hover:bg-muted/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.zip,.rar,.md"
                onChange={handleFileUpload}
                disabled={contextLoading}
                className="hidden"
              />
              {contextLoading ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" />
                  <p className="text-sm font-medium text-foreground">
                    {uploadStatusText || "Đang tải lên..."}
                  </p>
                  {uploadProgress > 0 && (
                    <div className="w-full max-w-xs mt-3 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">Hoặc tải lên tài liệu mới</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hỗ trợ: PDF, Word, PowerPoint, ZIP, RAR (Tối đa 10GB, tự động chia nhỏ khi &gt; 4MB)
                  </p>
                </>
              )}
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

            {/* Lịch sử phiên chat — xem lại / tiếp tục / xoá theo từng tài liệu */}
            <div className="mb-6 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground">
                  Lịch sử phiên chất vấn
                  {sessions.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({sessions.length} phiên)
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="Tìm phiên..."
                    className="w-36 sm:w-44 bg-muted/40 border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={fetchSessions}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    ↻ Làm mới
                  </button>
                </div>
              </div>

              {sessionsLoading && sessions.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang tải lịch sử...
                </div>
              )}

              {!sessionsLoading && sessions.length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-xl">
                  Chưa có phiên chat nào. Vào phòng để bắt đầu — các phiên sẽ tự lưu tại đây.
                </div>
              )}

              {sessions.length > 0 && (() => {
                // Gom phiên theo từng tài liệu
                const q = searchQ.trim().toLowerCase();
                const filtered = q
                  ? sessions.filter(
                      (s) =>
                        s.title.toLowerCase().includes(q) ||
                        s.preview.toLowerCase().includes(q)
                    )
                  : sessions;
                const grouped = new Map<number | null, MockSession[]>();
                for (const s of filtered) {
                  const key = s.document_id ?? null;
                  if (!grouped.has(key)) grouped.set(key, []);
                  grouped.get(key)!.push(s);
                }
                if (filtered.length === 0) {
                  return (
                    <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-xl">
                      Không tìm thấy phiên chat nào khớp.
                    </div>
                  );
                }

                return (
                  <div className="max-h-72 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                    {Array.from(grouped.entries()).map(([docId, list]) => {
                      const docName =
                        docId != null
                          ? studentDocs.find((d) => d.id === docId)?.filename ||
                            `Tài liệu #${docId}`
                          : "Chat tự do (không tài liệu)";
                      return (
                        <div
                          key={docId ?? "free"}
                          className="border border-border rounded-xl overflow-hidden"
                        >
                          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
                            <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="text-xs font-semibold text-foreground truncate">
                              {docName}
                            </span>
                            <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                              {list.length} phiên
                            </span>
                          </div>
                          <div className="divide-y divide-border/60">
                            {list.map((s) => (
                              <div
                                key={s.id}
                                className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors group"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {s.title}
                                    </p>
                                    {activeSessionId === s.id && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-bold shrink-0">
                                        Đang hoạt động
                                      </span>
                                    )}
                                  </div>
                                  {s.preview && (
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                      {s.preview}
                                    </p>
                                  )}
                                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                                    {s.message_count} tin ·{" "}
                                    {new Date(s.updated_at).toLocaleString("vi-VN")}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => openSessionView(s.id)}
                                    disabled={viewLoading}
                                    className="px-2 py-1 rounded-md border border-border bg-muted/40 hover:border-primary hover:text-primary text-[11px] font-semibold text-muted-foreground transition-colors"
                                    title="Xem lại phiên (chỉ đọc)"
                                  >
                                    Xem lại
                                  </button>
                                  <button
                                    onClick={() => resumeSession(s.id)}
                                    disabled={contextLoading}
                                    className="px-2 py-1 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-[11px] font-semibold text-primary transition-colors"
                                    title="Tiếp tục phiên này trong phòng chat"
                                  >
                                    Tiếp tục
                                  </button>
                                  <button
                                    onClick={() => deleteSession(s.id)}
                                    className="px-2 py-1 rounded-md border border-border bg-muted/40 hover:border-red-500/50 hover:text-red-400 text-[11px] font-semibold text-muted-foreground transition-colors"
                                    title="Xoá phiên"
                                  >
                                    Xoá
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

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
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-card/80 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
              <h2 className="text-sm font-semibold text-foreground">Phòng chat với Giám khảo AI</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium hidden sm:inline-block">
                Hội đồng phản biện trực tuyến
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearHistory}
                className="px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                title="Bắt đầu phiên thi mới"
              >
                Phiên mới
              </button>
              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive text-xs font-bold transition-colors"
                title="Thoát khỏi phòng chat"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                Thoát
              </button>
            </div>
          </div>

          {/* Main Workspace — chat thuần, căn giữa cân đối */}
          <div className="flex-1 overflow-hidden relative flex flex-col bg-background/50 w-full">
            <div className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Phiên chất vấn — Giám khảo AI
                  </span>
                  <div className="h-px bg-border flex-1" />
                </div>

                {/* Uploaded Document Summary (mentor AI đã đọc) */}
                {selectedDocId && projectContext && (
                  <div className="bg-card/70 border border-border rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold text-primary tracking-wide uppercase">
                        Tài liệu phản biện
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      {studentDocs.find((d) => d.id === selectedDocId)?.filename || uploadedFile?.name || "Tài liệu đồ án"}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {extractContextSummary(projectContext)}
                    </p>
                    <div className="mt-2 text-[11px] text-muted-foreground/80 flex items-center gap-1.5">
                      <span>💡</span> Giám khảo AI đã nạp tài liệu và sẽ xoáy sâu vào nội dung đồ án khi chất vấn.
                    </div>
                  </div>
                )}

                {/* Messages list */}
                <div className="space-y-5">
                  {messages.map((msg, index) => {
                    const isMine = msg.role === "user";

                    return (
                      <div
                        key={msg.id || index}
                        className={`flex gap-3.5 items-start ${isMine ? "justify-end" : "justify-start"}`}
                      >
                        {!isMine && (
                          <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold bg-gradient-to-br from-indigo-500 to-primary text-white border border-primary/30 mt-0.5 shadow-sm">
                            AI
                          </div>
                        )}

                        <div className={`flex flex-col ${isMine ? "items-end max-w-[80%]" : "items-start max-w-[88%] w-full"}`}>
                          <div className={`flex items-baseline gap-2 mb-1.5 ${isMine ? "flex-row-reverse" : ""}`}>
                            <span className="text-xs font-semibold text-foreground">
                              {isMine ? "Bạn (Sinh viên)" : "Giám khảo AI"}
                            </span>
                            {msg.time && (
                              <span className="text-[11px] text-muted-foreground">
                                {msg.time}
                              </span>
                            )}
                          </div>

                          <div
                            className={`rounded-2xl text-sm leading-relaxed shadow-sm w-full ${
                              isMine
                                ? "rounded-tr-sm px-4 py-3 bg-primary text-primary-foreground"
                                : "rounded-tl-sm p-5 bg-card/90 border border-border text-foreground"
                            }`}
                          >
                            {msg.role === "mentor" ? (
                              <MarkdownMessage content={msg.content} />
                            ) : (
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            )}
                          </div>
                        </div>

                        {isMine && (
                          <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold bg-primary/20 text-primary border border-primary/40 mt-0.5 shadow-sm">
                            Bạn
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  {isTyping && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3.5 items-start"
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-primary flex items-center justify-center text-xs font-bold text-white shadow-sm">
                        AI
                      </div>
                      <div className="bg-card border border-border p-4 rounded-2xl rounded-tl-sm shadow-sm">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Chat Input Bar */}
            <div className="p-4 border-t border-border bg-card/70 backdrop-blur-md shrink-0">
              <div className="max-w-4xl mx-auto w-full">
                {isRecording && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-rose-400 font-medium animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Đang nghe... hãy nói câu trả lời của bạn trực tiếp vào micro
                  </div>
                )}
                <div className="relative flex items-center gap-2">
                  <button
                    onClick={isRecording ? stopSTT : startSTT}
                    type="button"
                    title={isRecording ? "Dừng ghi âm" : "Nói câu trả lời bằng Micro"}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                      isRecording
                        ? "bg-rose-500/20 border-rose-500/50 text-rose-400 animate-pulse"
                        : "bg-muted/40 border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <div className="relative flex-1">
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Gửi câu trả lời hoặc tin nhắn bảo vệ đồ án..."
                      className="w-full bg-muted/40 border border-border rounded-xl py-3 pl-4 pr-12 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
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
                      className="absolute right-1.5 top-1.5 w-8 h-8 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary flex items-center justify-center text-primary-foreground transition-colors"
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
          </div>
        </>
      )}

      {/* ── Modal xem lại phiên cũ (chỉ đọc) ── */}
      <AnimatePresence>
        {viewSession && (
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
              className="w-full max-w-2xl max-h-[85vh] flex flex-col"
            >
              <Card className="p-0 overflow-hidden flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-primary/5 shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground truncate">
                      {viewSession.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(viewSession.created_at).toLocaleString("vi-VN")} ·{" "}
                      {viewSession.messages.length} tin ·{" "}
                      {viewSession.document_id
                        ? studentDocs.find((d) => d.id === viewSession.document_id)
                            ?.filename || `Tài liệu #${viewSession.document_id}`
                        : "Chat tự do"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        const sid = viewSession.id;
                        setViewSession(null);
                        void resumeSession(sid);
                      }}
                      disabled={contextLoading}
                    >
                      Tiếp tục phiên này
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewSession(null)}
                      className="h-8 w-8 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
                  {viewSession.messages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Phiên này chưa có tin nhắn.
                    </p>
                  )}
                  {viewSession.messages.map((m, i) => {
                    const isMine = m.role === "user";
                    return (
                      <div
                        key={i}
                        className={`flex gap-3 items-start ${
                          isMine ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`flex flex-col ${
                            isMine ? "items-end max-w-[85%]" : "items-start max-w-[90%]"
                          }`}
                        >
                          <div
                            className={`flex items-baseline gap-2 mb-1 ${
                              isMine ? "flex-row-reverse" : ""
                            }`}
                          >
                            <span className="text-[11px] font-semibold text-foreground">
                              {isMine ? "Bạn" : "Giám khảo AI"}
                            </span>
                            {m.time && (
                              <span className="text-[10px] text-muted-foreground">
                                {m.time}
                              </span>
                            )}
                          </div>
                          <div
                            className={`rounded-2xl text-sm leading-relaxed ${
                              isMine
                                ? "rounded-tr-sm px-3.5 py-2.5 bg-primary text-primary-foreground"
                                : "rounded-tl-sm p-4 bg-muted/60 border border-border text-foreground"
                            }`}
                          >
                            {m.role === "user" ? (
                              <p className="whitespace-pre-wrap">{m.content}</p>
                            ) : (
                              <MarkdownMessage content={m.content} />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-muted-foreground text-center pt-2">
                    — hết phiên (chế độ chỉ đọc) —
                  </p>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
