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
import {
  COMMITTEE_PERSONAS,
  type CommitteePersona,
  type MockMessage,
  mockCommitteeQuestion,
  mockSuggestions,
  mockMockReport,
  type MockReport,
} from "@/lib/mock-ai-data";

/**
 * ─────────────────────────────────────────────────────────────
 *  MockRoomAI — Phòng mock defense do AI mentor dẫn dắt
 *
 *  Workflow 4 bước:
 *  1. Context Ingestion — upload file → AI đọc hiểu nội dung
 *  2. AI Committee Setup — chọn 2-3 persona hội đồng
 *  3. Voice Interaction — STT → AI xử lý → TTS phản hồi
 *  4. AI Analytics — báo cáo điểm số, rubric, gợi ý câu trả lời
 *
 *  UI: giống mock-room bình thường (video grid, stepper, sidebar tabs,
 *  bottom toolbar, live captions, CLO coverage) nhưng thay mentor con người
 *  bằng AI mentor.
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

export default function MockRoomAI() {
  const router = useRouter();
  // ── State ──────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("presentation");
  const [timeLeft, setTimeLeft] = useState(PHASES[0].minutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);

  // Workflow steps
  const [step, setStep] = useState<"upload" | "committee" | "room">("upload");
  const [projectContext, setProjectContext] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedCommittee, setSelectedCommittee] = useState<string[]>(["technical", "business"]);
  const [activeCommittee, setActiveCommittee] = useState<CommitteePersona>(COMMITTEE_PERSONAS[0]);

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
  const [activeTab, setActiveTab] = useState<"chat" | "people" | "qa">("chat");
  const [expandedTile, setExpandedTile] = useState<boolean>(false);

  // CLO coverage (giống mock-room)
  const [coverage, setCoverage] = useState<Record<string, number>>({});

  // Current question (giống mock-room)
  const [currentQuestion, setCurrentQuestion] = useState<{
    question_id: string;
    question: string;
    clo: string;
    type: string;
    difficulty: string;
  } | null>(null);

  // Participants (giống mock-room)
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Elapsed time (giống mock-room)
  const [elapsed, setElapsed] = useState(0);
  const joinedAtRef = useRef<number>(Date.now());

  // Report state
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<MockReport | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<any>(null);
  const isIntentionalStopRef = useRef(false);

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
            const r = mockMockReport(projectContext);
            setReport(r);
            setShowReport(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
    };
  }, [isRunning, timeLeft, phaseIdx, projectContext]);

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

  // ── File upload handler ────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setProjectContext(text || file.name);
      };
      reader.readAsText(file);
    }
  };

  // ── Chuyển sang phòng chat ─────────────────────────────
  const startMockRoom = () => {
    if (!projectContext.trim()) {
      alert("Vui lòng tải lên file đồ án trước khi bắt đầu!");
      return;
    }
    setStep("room");
    const firstPersona = COMMITTEE_PERSONAS.find((p) => p.key === selectedCommittee[0]) || COMMITTEE_PERSONAS[0];
    setActiveCommittee(firstPersona);
    // Build participants list (bạn + AI committee)
    const participantList: Participant[] = [
      { user_id: 1, name: "Bạn (Sinh viên)", role: "student" },
      ...selectedCommittee.map((key, idx) => {
        const p = COMMITTEE_PERSONAS.find((c) => c.key === key);
        return { user_id: 100 + idx, name: p?.name || "AI", role: "mentor" };
      }),
    ];
    setParticipants(participantList);
    const welcomeMsg: MockMessage = {
      id: Date.now(),
      role: "mentor",
      content: firstPersona.greeting,
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      suggestions: ["Bắt đầu thuyết trình", "Giải thích kiến trúc", "Trình bày kết quả"],
    };
    setMessages([welcomeMsg]);
  };

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
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const reply = mockCommitteeQuestion(activeCommittee.key, projectContext, phase);
      const mentorMsg: MockMessage = {
        id: Date.now() + 1,
        role: "mentor",
        content: reply,
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        suggestions: mockSuggestions(activeCommittee.key),
      };
      setMessages((prev) => [...prev, mentorMsg]);
      setIsTyping(false);
    }, 800);
  }, [input, isTyping, activeCommittee, projectContext, phase]);

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
    setShowReport(false);
    setReport(null);
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
          setMessages((prev) => [...prev, userMsg]);
          setIsTyping(true);

          setTimeout(() => {
            const reply = mockCommitteeQuestion(activeCommittee.key, projectContext, phase);
            const mentorMsg: MockMessage = {
              id: Date.now() + 1,
              role: "mentor",
              content: reply,
              time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
              suggestions: mockSuggestions(activeCommittee.key),
            };
            setMessages((prev) => [...prev, mentorMsg]);
            setIsTyping(false);
          }, 800);
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
  }, [activeCommittee, projectContext, phase]);

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0A0A0A] text-white font-sans overflow-hidden">
      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 flex items-center justify-center p-8"
        >
          <Card className="max-w-2xl w-full p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_hsl(var(--primary)/0.2)]">
              <Upload className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-serif font-black mb-3">
              Tải lên tài liệu đồ án
            </h2>
            <p className="text-muted-foreground mb-6">
              Tải lên file PDF/Word của đồ án để AI hội đồng phân tích nội dung và đặt câu hỏi chuyên sâu.
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all mb-6"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.pptx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">
                {uploadedFile ? uploadedFile.name : "Click để chọn file"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Hỗ trợ: PDF, Word, PowerPoint (tối đa 10MB)
              </p>
            </div>

            {uploadedFile && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-muted/30 rounded-xl"
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

            <Button
              onClick={() => setStep("committee")}
              disabled={!uploadedFile}
              className="w-full h-12 text-lg font-bold rounded-xl"
            >
              Tiếp tục chọn Hội đồng AI
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Card>
        </motion.div>
      )}

      {/* ── Step 2: Committee Setup ── */}
      {step === "committee" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 flex items-center justify-center p-8"
        >
          <Card className="max-w-3xl w-full p-8">
            <h2 className="text-2xl font-serif font-black mb-2 text-center">
              Chọn Hội đồng AI
            </h2>
            <p className="text-muted-foreground text-center mb-6">
              Chọn 2-3 persona hội đồng để đánh giá đồ án của bạn.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {COMMITTEE_PERSONAS.map((p) => {
                const Icon = p.icon;
                const isSelected = selectedCommittee.includes(p.key);
                return (
                  <button
                    key={p.key}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedCommittee((prev) => prev.filter((k) => k !== p.key));
                      } else if (selectedCommittee.length < 3) {
                        setSelectedCommittee((prev) => [...prev, p.key]);
                      }
                    }}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full bg-gradient-to-br ${p.color} flex items-center justify-center mb-3`}
                    >
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="font-bold text-lg">{p.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {p.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {p.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Quay lại
              </Button>
              <Button
                onClick={startMockRoom}
                disabled={selectedCommittee.length === 0}
                className="px-6"
              >
                Bắt đầu phòng
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ── Step 3: Mock Room ── */}
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
                        className={`w-32 h-32 rounded-full bg-gradient-to-br ${activeCommittee.color} flex items-center justify-center relative shadow-[0_0_50px_rgba(168,85,247,0.15)]`}
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
                    const roleLabel = p.role === "mentor" ? "Mentor" : "Sinh viên";
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
                      <p className="text-muted-foreground">AI Committee — {activeCommittee.name}</p>
                    </div>
                    <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                      AI COMMITTEE
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

              {/* Live Captions (giống mock-room) */}
              <div className="absolute bottom-4 left-0 right-0 px-4">
                <div className="bg-[#0f1513] border border-teal-900/50 rounded-xl p-4 shadow-xl backdrop-blur-md">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-teal-900/60 p-1 rounded text-teal-400">
                      <MessageSquare className="w-3 h-3" />
                    </div>
                    <span className="text-[10px] font-bold text-teal-500 tracking-wider uppercase">PHỤ ĐỀ TRỰC TIẾP — AI HỘI ĐỒNG</span>
                  </div>
                  <p className="text-gray-200 text-sm font-medium leading-relaxed">
                    {currentQuestion
                      ? `🤖 ${currentQuestion.question}`
                      : "Phòng họp đã sẵn sàng. Bắt đầu trò chuyện với hội đồng AI hoặc chia sẻ màn hình để bảo vệ đồ án."}
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
              <button
                onClick={() => setActiveTab("qa")}
                className={`flex-1 py-4 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                  activeTab === "qa"
                    ? "text-teal-400 border-b-2 border-teal-500"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <span className="w-4 h-4">❓</span>
                HỎI & ĐÁP
              </button>
            </div>

            {/* Tab content */}
            {activeTab === "chat" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                <div className="flex items-center gap-4">
                  <div className="h-px bg-gray-800 flex-1"></div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Phiên Mock Room</span>
                  <div className="h-px bg-gray-800 flex-1"></div>
                </div>

                {/* Current Question Display (giống mock-room) */}
                {currentQuestion && (
                  <div className="bg-teal-900/20 border border-teal-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-teal-400 px-2 py-0.5 rounded bg-teal-900/30">
                        {currentQuestion.clo}
                      </span>
                      <span className="text-xs text-gray-500 px-2 py-0.5 rounded bg-gray-800/50">
                        {currentQuestion.type} • {currentQuestion.difficulty}
                      </span>
                    </div>
                    <p className="text-gray-200 font-medium">{currentQuestion.question}</p>
                  </div>
                )}

                {/* CLO Coverage (giống mock-room) */}
                <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">PHỦ TIÊU CHÍ (CLO)</span>
                  </div>
                  <div className="mb-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(coverage).map(([clo, count]) => (
                        <span key={clo} className="bg-teal-900/30 border border-teal-800/50 rounded-full px-2 py-1 text-xs text-teal-300">
                          {clo}: {count}/2
                        </span>
                      ))}
                      {Object.keys(coverage).length === 0 && (
                        <span className="text-xs text-gray-500">Chưa có tiêu chí nào được phủ</span>
                      )}
                    </div>
                  </div>
                </div>

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
                            <span className="text-sm font-semibold text-gray-200">{isMine ? "Bạn" : "AI Committee"}</span>
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
                        className={`w-8 h-8 rounded-full bg-gradient-to-br ${activeCommittee.color} flex items-center justify-center`}
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
                          {isMentor ? "Mentor" : "Sinh viên"}
                        </div>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Q&A tab (giống mock-room) */}
            {activeTab === "qa" && (
              <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Câu hỏi từ Mentor (giai đoạn chất vấn)
                  </div>
                  <div className="text-sm text-gray-500 text-center py-8">
                    Chưa có câu hỏi nào từ Mentor.
                  </div>
                </div>
                <div className="p-4 border-t border-gray-800/60">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Đặt câu hỏi cho sinh viên..."
                      className="w-full bg-[#1A1A1A] border border-gray-700/50 rounded-full py-3 pl-4 pr-12 text-sm text-gray-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-gray-600"
                    />
                    <button className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center text-white transition-colors">
                      <Send className="w-4 h-4 ml-0.5" />
                    </button>
                  </div>
                </div>
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
                  <div>
                    <label className="text-sm font-medium mb-2 block">Chọn Hội đồng AI</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedCommittee.map((key) => {
                        const persona = COMMITTEE_PERSONAS.find((p) => p.key === key);
                        return persona ? (
                          <span
                            key={key}
                            className="text-xs px-2.5 py-1 rounded-full bg-muted/30 border border-border"
                          >
                            {persona.name}
                          </span>
                        ) : null;
                      })}
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

      {/* ── Report Modal ── */}
      <AnimatePresence>
        {showReport && report && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-4xl max-h-[80vh] overflow-y-auto"
            >
              <Card className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-serif font-black">
                    Báo cáo Mock Defense AI
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReport(false)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Score */}
                <div className="text-center mb-8">
                  <div className="text-6xl font-black text-gradient mb-2">
                    {report.score}/100
                  </div>
                  <p className="text-muted-foreground">Điểm tổng kết</p>
                </div>

                {/* Rubric scores */}
                <div className="mb-6">
                  <h3 className="text-lg font-serif font-bold mb-3">Điểm theo Rubric</h3>
                  <div className="space-y-3">
                    {report.rubricScores.map((r) => (
                      <div key={r.criterion} className="flex items-center gap-4">
                        <span className="text-sm font-medium w-48">{r.criterion}</span>
                        <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                            style={{ width: `${(r.score / r.max) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold w-12 text-right">
                          {r.score}/{r.max}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strengths & Weaknesses */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="text-lg font-serif font-bold mb-3 flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                      Điểm mạnh
                    </h3>
                    <ul className="space-y-2">
                      {report.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-serif font-bold mb-3 flex items-center gap-2 text-red-400">
                      <AlertCircle className="w-5 h-5" />
                      Cần cải thiện
                    </h3>
                    <ul className="space-y-2">
                      {report.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Action items */}
                <div className="mb-6">
                  <h3 className="text-lg font-serif font-bold mb-3">Hành động tiếp theo</h3>
                  <ul className="space-y-2">
                    {report.actionItems.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-6 border-t border-border">
                  <Button
                    onClick={() => setShowReport(false)}
                    className="flex-1"
                  >
                    Quay lại phòng
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "mock-report.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Tải báo cáo
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
