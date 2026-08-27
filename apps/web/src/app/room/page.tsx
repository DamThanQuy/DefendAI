"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/constants";
import { 
  Mic, 
  VideoIcon, 
  MonitorUp, 
  Hand, 
  MoreHorizontal, 
  MessageSquare,
  Settings,
  Users,
  Send,
  Loader2,
  X,
} from "lucide-react";

type Message = {
  id?: number;
  sender_name: string;
  sender_role: string;
  content: string;
  created_at?: string;
};

type QAMessage = {
  type: string;
  question_id?: string;
  question?: string;
  clo?: string;
  qa_type?: string;
  difficulty?: string;
  oga_score?: number;
  tda_score?: number;
  feedback?: string;
  quality_criteria_met?: string[];
  confidence?: number;
  hint?: string;
  level?: number;
  oga?: number;
  tda?: number;
  coverage?: Record<string, number>;
  summary?: any;
  message?: string;
  session_id?: string;
};

export default function MockRoomPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<{question_id: string; question: string; clo: string; type: string; difficulty: string} | null>(null);
  const [scores, setScores] = useState({ oga: 0, tda: 0, coverage: {} as Record<string, number> });
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isIntentionalStopRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const meetingId = 1; // Temporary hardcoded for demo

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      console.error("No auth token found");
      return;
    }

    const wsUrl = `${API_BASE_URL.replace("http", "ws")}/api/mock-qa/${meetingId}/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWSMessage(data);
      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log("WebSocket disconnected");
    };

    ws.onerror = (err) => {
      console.error("WebSocket error", err);
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [meetingId]);

  const handleWSMessage = (data: QAMessage) => {
    switch (data.type) {
      case "connected":
        setSessionId(data.session_id);
        break;
      case "question":
        setCurrentQuestion({
          question_id: data.question_id,
          question: data.question,
          clo: data.clo,
          type: data.type,
          difficulty: data.difficulty,
        });
        setIsLoading(false);
        break;
      case "feedback":
        setScores(prev => ({
          oga: data.oga_score,
          tda: data.tda_score,
          coverage: data.coverage || {},
        }));
        // Add feedback as a message
        const feedbackMsg = {
          sender_name: "AI Hội đồng",
          sender_role: "assistant",
          content: `📊 **Điểm**: OGA ${data.oga_score}/10 | TDA ${data.tda_score}/10\n\n${data.feedback}`,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, feedbackMsg as Message]);
        break;
      case "score_update":
        setScores(prev => ({
          oga: data.oga,
          tda: data.tda,
          coverage: data.coverage || {},
        }));
        break;
      case "hint":
        // Add hint as a message
        const hintMsg = {
          sender_name: "AI Mentor",
          sender_role: "assistant",
          content: `💡 **Gợi ý (Level ${data.level})**: ${data.hint}`,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, hintMsg as Message]);
        break;
      case "done":
        // Session completed
        const summaryMsg = {
          sender_name: "AI Hội đồng",
          sender_role: "assistant",
          content: `✅ **Phiên Mock Room hoàn tất!**\n\n📊 **Điểm cuối**: OGA ${data.summary?.oga_final}/10 | TDA ${data.summary?.tda_final}/10\n\n💪 **Điểm mạnh**:\n${data.summary?.strengths?.map(s => `- ${s}`).join("\n") || "-"}\n\n⚠️ **Cần cải thiện**:\n${data.summary?.weaknesses?.map(w => `- ${w}`).join("\n") || "-"}\n\n🎯 **Hành động tiếp theo**:\n${data.summary?.action_items?.map(a => `- ${a}`).join("\n") || "-"}`,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, summaryMsg as Message]);
        break;
      case "error":
        console.error("WS Error:", data.message);
        break;
      case "pong":
        // Keep alive
        break;
    }
  };

  const sendAnswer = async (content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    const answerMsg = {
      sender_name: "Bạn",
      sender_role: "student",
      content: content,
    };
    
    // Optimistic update
    setMessages(prev => [...prev, { ...answerMsg, created_at: new Date().toISOString() } as Message]);
    
    wsRef.current?.send(JSON.stringify({
      type: "answer",
      content: content,
    }));
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    await sendAnswer(inputValue);
    setInputValue("");
  };

  const handleHintRequest = (level: number = 1) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: "hint_request",
      level: level,
    }));
  };

  const handleGetStatus = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "get_status" }));
    }
  };

  const handleToggleRecord = () => {
    if (!recognitionRef.current) {
      alert("Trình duyệt của bạn không hỗ trợ nhận dạng giọng nói tự động. Vui lòng sử dụng Google Chrome hoặc Edge.");
      return;
    }

    if (isRecording) {
      isIntentionalStopRef.current = true;
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      isIntentionalStopRef.current = false;
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Failed to start recording", err);
      }
    }
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
          await sendAnswer(transcript);
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
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
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
  }, [meetingId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0A0A0A] text-white font-sans overflow-hidden">
      
      {/* Sub-Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/60 bg-[#0f0f0f]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)] ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-xs font-bold tracking-wider text-gray-300">{isConnected ? "LIVE" : "DISCONNECTED"}</span>
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-gray-100">Phòng bảo vệ đồ án — AI Mock Defense</h2>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full border border-gray-500 flex items-center justify-center text-[8px]">⏱</span>
                00:00
              </span>
              <span className="flex items-center gap-1">
                <span className="flex gap-[1px] h-3 items-end">
                  <span className="w-0.5 h-1.5 bg-green-500"></span>
                  <span className="w-0.5 h-2 bg-green-500"></span>
                  <span className="w-0.5 h-2.5 bg-green-500"></span>
                  <span className="w-0.5 h-3 bg-gray-600"></span>
                </span>
                240 kbps
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#1A1A1A] px-3 py-1.5 rounded-full border border-gray-800">
            <Users className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-medium text-gray-300">3 / 8</span>
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
          
          {/* Video Grid */}
          <div className="flex-1 grid grid-cols-2 gap-4 pb-24 relative">
            
            {/* Card 1: Giám khảo 1 */}
            <div className="bg-[#121212] rounded-2xl border border-teal-900/40 relative overflow-hidden flex flex-col items-center justify-center group">
              <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                AI
              </div>
              
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-400 to-blue-600 flex items-center justify-center relative shadow-[0_0_50px_rgba(45,212,191,0.2)]">
                <span className="text-5xl text-white opacity-90 drop-shadow-lg">✨</span>
                {/* Speaking indicator */}
                <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-teal-400 border-2 border-[#121212] shadow-[0_0_10px_rgba(45,212,191,0.8)]"></span>
              </div>
              
              <div className="mt-6 text-center">
                <h3 className="text-lg font-bold text-gray-100 mb-2">PGS.TS Nguyễn Văn B</h3>
                <span className="inline-flex items-center gap-1.5 text-xs text-teal-400 bg-teal-950/40 px-3 py-1 rounded-full border border-teal-800/50">
                  <span>🤖</span> AI Giám khảo
                </span>
              </div>

              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                <Mic className="w-3.5 h-3.5 text-gray-300" />
                <span className="text-xs text-gray-300 font-medium">PGS.TS Nguyễn Văn B</span>
              </div>
            </div>

            {/* Card 2: Giám khảo 2 */}
            <div className="bg-[#121212] rounded-2xl border border-purple-900/30 relative overflow-hidden flex flex-col items-center justify-center group">
              <div className="absolute top-4 right-4 bg-teal-950/50 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-800/50">
                AI
              </div>
              
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center relative shadow-[0_0_50px_rgba(168,85,247,0.15)]">
                <span className="text-5xl text-white opacity-90 drop-shadow-lg">✨</span>
              </div>
              
              <div className="mt-6 text-center">
                <h3 className="text-lg font-bold text-gray-100 mb-2">TS Trần Thị C</h3>
                <span className="inline-flex items-center gap-1.5 text-xs text-teal-400 bg-teal-950/40 px-3 py-1 rounded-full border border-teal-800/50">
                  <span>🤖</span> AI Giám khảo
                </span>
              </div>

              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                <Mic className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-400 font-medium">TS Trần Thị C</span>
              </div>
            </div>

            {/* Floating User Picture-in-Picture */}
            <div className="absolute bottom-28 right-4 w-48 aspect-[4/3] bg-[#1a1a1a] rounded-xl border border-gray-700/50 shadow-2xl flex flex-col items-center justify-center overflow-hidden z-10">
              <div className="w-12 h-12 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                <Users className="w-5 h-5" />
              </div>
              <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2 py-1 rounded flex items-center gap-1.5">
                <Mic className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-gray-300">Bạn (Sinh viên)</span>
              </div>
            </div>

            {/* Live Captions */}
            <div className="absolute bottom-4 left-0 right-0 px-4">
              <div className="bg-[#0f1513] border border-teal-900/50 rounded-xl p-4 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-2">
                  <div className="bg-teal-900/60 p-1 rounded text-teal-400">
                    <MessageSquare className="w-3 h-3" />
                  </div>
                  <span className="text-[10px] font-bold text-teal-500 tracking-wider uppercase">PHỤ ĐỀ TRỰC TIẾP — PGS.TS Nguyễn Văn B</span>
                </div>
                <p className="text-gray-200 text-sm font-medium leading-relaxed">
                  "Bạn có thể giải thích rõ hơn về kiến trúc <span className="text-teal-400">Microservices</span> mà bạn đã đề cập trong chương 3 không? Cụ thể là cách xử lý đồng bộ giữa các service."
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Toolbar */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-[#0A0A0A] border-t border-gray-800/40 flex items-center justify-between px-6 z-20">
            <div className="w-32"></div> {/* Spacer */}
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleToggleRecord}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  isRecording 
                    ? "bg-red-500/20 border border-red-500 text-red-500 animate-pulse" 
                    : "bg-[#202020] hover:bg-[#2A2A2A] text-gray-300"
                }`}
              >
                <Mic className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-full bg-[#202020] hover:bg-[#2A2A2A] flex items-center justify-center text-gray-300 transition-colors">
                <VideoIcon className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-full bg-[#202020] hover:bg-[#2A2A2A] flex items-center justify-center text-gray-300 transition-colors">
                <MonitorUp className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-full bg-[#202020] hover:bg-[#2A2A2A] flex items-center justify-center text-gray-300 transition-colors">
                <Hand className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-full bg-[#202020] hover:bg-[#2A2A2A] flex items-center justify-center text-gray-300 transition-colors">
                <MoreHorizontal className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-xl bg-teal-900/30 border border-teal-800/50 hover:bg-teal-900/50 flex items-center justify-center text-teal-400 transition-colors ml-2">
                <MessageSquare className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex items-center justify-end w-32">
              <Button className="bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-full px-6 h-10 font-semibold shadow-lg shadow-red-900/20">
                <Hand className="w-4 h-4 mr-2" />
                Rời phòng
              </Button>
            </div>
          </div>
        </div>

        {/* Right Sidebar (Chat + Q&A) */}
        <div className="w-[380px] bg-[#0A0A0A] border-l border-gray-800/60 flex flex-col h-full">
          
          {/* Tabs */}
          <div className="flex border-b border-gray-800/60">
            <button className="flex-1 py-4 text-xs font-bold text-teal-400 border-b-2 border-teal-500 flex items-center justify-center gap-2">
              <MessageSquare className="w-4 h-4" />
              TRÒ CHUYỆN
            </button>
            <button className="flex-1 py-4 text-xs font-bold text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-2">
              <Users className="w-4 h-4" />
              MỌI NGƯỜI (3)
            </button>
            <button className="flex-1 py-4 text-xs font-bold text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-2">
              <span className="w-4 h-4">❓</span>
              HỎI & ĐÁP
            </button>
          </div>

          {/* Chat + Q&A Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            
            <div className="flex items-center gap-4">
              <div className="h-px bg-gray-800 flex-1"></div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Phiên Mock Room</span>
              <div className="h-px bg-gray-800 flex-1"></div>
            </div>

            {/* Current Question Display */}
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
              </div>)}
            
            {/* Scores & Coverage */}
            <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ĐIỂM REAL-TIME</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-teal-900/30 border border-teal-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-teal-400 font-bold">OGA</span>
                    <span className="text-teal-300 font-bold text-lg">{scores.oga.toFixed(1)}</span>
                    <span className="text-teal-500 text-xs">/10</span>
                  </div>
                </div>
                <div className="bg-purple-900/30 border border-purple-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-purple-400 font-bold">TDA</span>
                    <span className="text-purple-300 font-bold text-lg">{scores.tda.toFixed(1)}</span>
                    <span className="text-purple-500 text-xs">/10</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(scores.coverage).map(([clo, count]) => (
                    <span key={clo} className="bg-teal-900/30 border border-teal-800/50 rounded-full px-2 py-1 text-xs text-teal-300">
                      {clo}: {count}/2
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="space-y-4">
              {messages.map((msg, index) => {
                const isStudent = msg.sender_role === "student";
                const avatarColor = isStudent 
                  ? "bg-teal-900/60 text-teal-300 border-teal-800/50" 
                  : "bg-blue-600 text-white border-blue-600";
                const initials = msg.sender_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                
                return (
                  <div key={msg.id || index} className="flex gap-3">
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm mt-1 border ${avatarColor}`}>
                      {initials}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-200">{msg.sender_name}</span>
                        {msg.created_at && (
                          <span className="text-xs text-gray-500">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm leading-relaxed ${isStudent ? 'text-gray-400 italic' : 'text-gray-300'}`}>
                        {msg.content}
                      </p>
                    </div>
                  </div>
                )}
              )}
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-gray-800/60">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Gửi câu trả lời hoặc tin nhắn..." 
                  className="w-full bg-[#1A1A1A] border border-gray-700/50 rounded-full py-3 pl-4 pr-12 text-sm text-gray-200 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all placeholder:text-gray-600"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button 
                  onClick={handleSendMessage}
                  className="absolute right-1.5 top-1.5 w-9 h-9 rounded-full bg-teal-600 hover:bg-teal-500 flex items-center justify-center text-white transition-colors"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}