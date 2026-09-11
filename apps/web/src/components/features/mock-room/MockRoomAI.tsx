"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Bot,
  Clock,
  Sparkles,
  Crown,
  MessageSquare,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Users,
  BarChart3,
  FileText,
  Copy,
  Check,
  Upload,
  Mic,
  MicOff,
  Volume2,
  Download,
  Share2,
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
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarkdownMessage } from "@/components/features/workspace/MarkdownMessage";
import {
  MENTOR_PERSONAS,
  type MentorPersona,
  type MentorMessage,
  mockMentorReply,
  mockSuggestions,
  MENTOR_ONLINE_LABEL,
  COMMITTEE_PERSONAS,
  type CommitteePersona,
  mockCommitteeQuestion,
  mockMockReport,
  type MockReport,
} from "@/app/ai-mentor/mentor-data";

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
 *  UI: giống mock-room bình thường (video grid, stepper, sidebar tabs)
 *  nhưng thay mentor con người bằng AI mentor.
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

export default function MockRoomAI() {
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
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Room controls
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "people" | "qa">("chat");
  const [expandedTile, setExpandedTile] = useState<boolean>(false);

  // CLO coverage (giống mock-room)
  const [coverage, setCoverage] = useState<Record<string, number>>({});

  // Report state
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<MockReport | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    const welcomeMsg: MentorMessage = {
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

    const userMsg: MentorMessage = {
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
      const mentorMsg: MentorMessage = {
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
          const userMsg: MentorMessage = {
            id: Date.now(),
            role: "user",
            content: transcript,
            time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
          };
          setMessages((prev) => [...prev, userMsg]);
          setIsTyping(true);

          setTimeout(() => {
            const reply = mockCommitteeQuestion(activeCommittee.key, projectContext, phase);
            const mentorMsg: MentorMessage = {
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
    <div className="h-[calc(100vh-64px)] flex flex-col bg-background text-foreground overflow-hidden">
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
          {/* Header: Phase + Timer + Controls */}
          <div className="h-16 border-b border-border bg-card/60 px-6 flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Phase stepper */}
              <div className="flex items-center gap-2">
                {PHASES.map((p, i) => {
                  const active = i === phaseIdx;
                  const done = i < phaseIdx;
                  return (
                    <div key={p.key} className="flex items-center gap-2">
                      <button
                        onClick={() => goToPhase(p.key)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          active
                            ? "bg-amber-500/20 border-amber-500 text-amber-300"
                            : done
                            ? "bg-teal-900/30 border-teal-800 text-teal-400"
                            : "bg-muted/40 border-border text-muted-foreground hover:bg-muted/70"
                        }`}
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
                      {i < PHASES.length - 1 && <span className="text-muted-foreground">→</span>}
                    </div>
                  );
                })}
              </div>

              {/* Active committee persona */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${activeCommittee.color} flex items-center justify-center`}
                >
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{activeCommittee.name}</p>
                  <p className="text-xs text-muted-foreground">{activeCommittee.title}</p>
                </div>
              </div>
            </div>

            {/* Timer + Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-full">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="font-mono font-bold text-sm">
                  {formatTime(timeLeft)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isRunning ? (
                  <Button size="sm" variant="ghost" onClick={() => setIsRunning(false)} className="h-8 w-8 p-0" title="Tạm dừng">
                    <Pause className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setIsRunning(true)} className="h-8 w-8 p-0" title="Bắt đầu đếm ngược">
                    <Play className="w-4 h-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={handleReset} className="h-8 w-8 p-0" title="Reset về giai đoạn 1">
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSettings(true)}
                className="h-8 w-8 p-0"
                title="Cài đặt phòng"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Main content: Video grid + Chat */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Video grid (giả lập) */}
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 max-w-4xl mx-auto">
                {/* Card 1: Bạn (sinh viên) */}
                <div className="bg-muted/20 rounded-2xl border border-border/40 relative overflow-hidden flex flex-col items-center justify-center h-48 group">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-teal-400 to-blue-600 flex items-center justify-center shadow-[0_0_30px_rgba(45,212,191,0.2)]">
                    <span className="text-4xl">🎓</span>
                  </div>
                  <div className="absolute top-3 right-3 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                    BẠN
                  </div>
                  <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                    <Mic className={`w-3.5 h-3.5 ${isRecording ? "text-red-400 animate-pulse" : "text-gray-500"}`} />
                    <span className="text-xs text-gray-300">
                      {isRecording ? "Đang nghe..." : "Nhấn mic để nói"}
                    </span>
                  </div>
                  {/* Maximize button */}
                  <button
                    onClick={() => setExpandedTile(true)}
                    className="absolute top-3 left-3 bg-black/50 hover:bg-black/70 text-white/80 hover:text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Phóng to"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Card 2: AI Committee */}
                <div className="bg-muted/20 rounded-2xl border border-border/40 relative overflow-hidden flex flex-col items-center justify-center h-48 group">
                  <div
                    className={`w-24 h-24 rounded-full bg-gradient-to-br ${activeCommittee.color} flex items-center justify-center shadow-[0_0_30px_hsl(var(--primary)/0.2)]`}
                  >
                    <Bot className="w-10 h-10 text-white" />
                  </div>
                  <div className="absolute top-3 right-3 bg-purple-950/50 text-purple-400 text-[10px] font-bold px-2 py-1 rounded border border-purple-800/50">
                    AI COMMITTEE
                  </div>
                  <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                    <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs text-gray-300">
                      {isSpeaking ? "Đang trả lời..." : "Sẵn sàng"}
                    </span>
                  </div>
                  {/* Maximize button */}
                  <button
                    onClick={() => setExpandedTile(true)}
                    className="absolute top-3 left-3 bg-black/50 hover:bg-black/70 text-white/80 hover:text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Phóng to"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Phase description */}
              <div className="mt-6 text-center">
                <h3 className="text-lg font-serif font-bold mb-1">{PHASES[phaseIdx].label}</h3>
                <p className="text-sm text-muted-foreground">{PHASES[phaseIdx].desc}</p>
              </div>

              {/* Live Captions (giống mock-room) */}
              <div className="mt-4">
                <div className="bg-muted/10 border border-border/30 rounded-xl p-4 shadow-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-teal-900/60 p-1 rounded text-teal-400">
                      <MessageSquare className="w-3 h-3" />
                    </div>
                    <span className="text-[10px] font-bold text-teal-500 uppercase tracking-wider">PHỤ ĐỀ TRỰC TIẾP — AI HỘI ĐỒNG</span>
                  </div>
                  <p className="text-foreground text-sm font-medium leading-relaxed">
                    {phase === "presentation"
                      ? "Bạn đang ở giai đoạn thuyết trình. Hãy bắt đầu trình bày đồ án của bạn."
                      : phase === "defense"
                      ? "Hội đồng AI sẽ hỏi bạn về kiến thức sâu và kỹ năng bảo vệ."
                      : "Hội đồng AI đang đưa ra nhận xét chi tiết về đồ án của bạn."}
                  </p>
                </div>
              </div>

              {/* CLO Coverage (giống mock-room) */}
              <div className="mt-4">
                <div className="bg-muted/10 border border-border/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">PHỦ TIÊU CHÍ (CLO)</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(coverage).map(([clo, count]) => (
                      <span key={clo} className="bg-teal-900/30 border border-teal-800/50 rounded-full px-2 py-1 text-xs text-teal-300">
                        {clo}: {count}/2
                      </span>
                    ))}
                    {Object.keys(coverage).length === 0 && (
                      <span className="text-xs text-muted-foreground">Chưa có tiêu chí nào được phủ</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Chat sidebar */}
            <div className="w-[380px] border-l border-border bg-card/40 flex flex-col">
              {/* Tab header */}
              <div className="flex border-b border-border">
                <button
                  onClick={() => setActiveTab("chat")}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                    activeTab === "chat"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  TRÒ CHUYỆN
                </button>
                <button
                  onClick={() => setActiveTab("people")}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                    activeTab === "people"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  MỌI NGƯỜI
                </button>
                <button
                  onClick={() => setActiveTab("qa")}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                    activeTab === "qa"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <HelpCircle className="w-4 h-4" />
                  HỎI & ĐÁP
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "mentor" && (
                      <div
                        className={`w-8 h-8 rounded-full bg-gradient-to-br ${activeCommittee.color} flex items-center justify-center shrink-0`}
                      >
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] ${msg.role === "user" ? "text-right" : "text-left"}`}
                    >
                      <div
                        className={`inline-block p-3 rounded-2xl ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-background border border-border"
                        }`}
                      >
                        {msg.role === "mentor" ? (
                          <MarkdownMessage content={msg.content} />
                        ) : (
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        )}
                      </div>
                      <div
                        className={`flex items-center gap-1 mt-1 text-xs text-muted-foreground ${
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

                      {/* Gợi ý câu hỏi */}
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
                        <span className="text-xs font-bold text-primary-foreground">U</span>
                      </div>
                    )}
                  </motion.div>
                ))}

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
                    <div className="bg-background border border-border p-3 rounded-2xl">
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
              <div className="border-t border-border p-4">
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Nhập câu trả lời của bạn..."
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
                <div className="flex items-center justify-between mt-2">
                  <button
                    onClick={() => {
                      if (isRecording) stopSTT();
                      else startSTT();
                    }}
                    className={`flex items-center gap-1 text-xs ${
                      isRecording ? "text-red-400" : "text-muted-foreground"
                    } hover:text-foreground transition-colors`}
                  >
                    {isRecording ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    {isRecording ? "Dừng STT" : "Bật STT (giọng nói)"}
                  </button>
                  <p className="text-[10px] text-muted-foreground">
                    Enter để gửi, Shift+Enter để xuống dòng
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

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
