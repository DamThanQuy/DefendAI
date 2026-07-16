"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { 
  Mic, 
  Video, 
  MonitorUp, 
  Hand, 
  MoreHorizontal, 
  MessageSquare,
  Settings,
  Users,
  Send
} from "lucide-react";

type Message = {
  id?: number;
  sender_name: string;
  sender_role: string;
  content: string;
  created_at?: string;
};

export default function MockRoomPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isIntentionalStopRef = useRef(false);
  const meetingId = 1; // Temporary hardcoded for demo

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/meetings/${meetingId}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (err) {
        console.error("Failed to fetch messages", err);
      }
    };
    fetchMessages();
    
    // Auto-refresh (simple polling)
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [meetingId]);

  useEffect(() => {
    // Initialize SpeechRecognition once
    if (typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "vi-VN";

      recognition.onresult = async (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        if (transcript) {
          const newMsg = {
            sender_name: "Bạn",
            sender_role: "student",
            content: transcript
          };
          
          setMessages(prev => [...prev, newMsg]);
          
          try {
            await fetch(`http://localhost:8000/api/meetings/${meetingId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(newMsg)
            });
          } catch (err) {
            console.error("Failed to send transcript", err);
          }
        }
      };

      recognition.onend = () => {
        if (!isIntentionalStopRef.current) {
          try { recognition.start(); } catch (e) {} // Keep continuous running
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

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const newMsg = {
      sender_name: "Bạn",
      sender_role: "student",
      content: inputValue
    };
    
    // Optimistic update
    setMessages(prev => [...prev, newMsg]);
    setInputValue("");
    
    try {
      await fetch(`http://localhost:8000/api/meetings/${meetingId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMsg)
      });
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] text-foreground font-sans overflow-hidden">
      
      {/* Sub-Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
            <span className="text-xs font-bold tracking-wider text-foreground">LIVE</span>
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-serif font-bold text-foreground">Phòng bảo vệ đồ án — AI Mock Defense</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full border border-gray-500 flex items-center justify-center text-[8px]">⏱</span>
                00:03
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
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full border border-border">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-foreground">3 / 8</span>
          </div>
          <button className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Left Column (Video Grid + Captions + Bottom Toolbar) */}
        <div className="flex-1 flex flex-col p-4 relative h-full">
          
          {/* Video Grid */}
          <div className="flex-1 grid grid-cols-2 gap-4 pb-24 relative">
            
            {/* Card 1: Giám khảo 1 */}
            <div className="bg-card shadow-sm rounded-2xl border border-primary/20 relative overflow-hidden flex flex-col items-center justify-center group">
              <div className="absolute top-4 right-4 bg-primary/20 text-primary text-[10px] font-bold px-2 py-1 rounded border border-primary/30">
                AI
              </div>
              
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center relative shadow-[0_0_50px_rgba(124,58,237,0.2)]">
                <span className="text-5xl text-white opacity-90 drop-shadow-lg">✨</span>
                {/* Speaking indicator */}
                <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-primary border-2 border-zinc-900 shadow-[0_0_10px_rgba(124,58,237,0.8)]"></span>
              </div>
              
              <div className="mt-6 text-center">
                <h3 className="text-lg font-serif font-bold text-foreground mb-2">PGS.TS Nguyễn Văn B</h3>
                <span className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                  <span>🤖</span> AI Giám khảo
                </span>
              </div>

              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                <Mic className="w-3.5 h-3.5 text-zinc-300" />
                <span className="text-xs text-zinc-300 font-medium">PGS.TS Nguyễn Văn B</span>
              </div>
            </div>

            {/* Card 2: Giám khảo 2 */}
            <div className="bg-card shadow-sm rounded-2xl border border-secondary/20 relative overflow-hidden flex flex-col items-center justify-center group">
              <div className="absolute top-4 right-4 bg-primary/20 text-primary text-[10px] font-bold px-2 py-1 rounded border border-primary/30">
                AI
              </div>
              
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-secondary to-accent flex items-center justify-center relative shadow-[0_0_50px_rgba(236,72,153,0.15)]">
                <span className="text-5xl text-white opacity-90 drop-shadow-lg">✨</span>
              </div>
              
              <div className="mt-6 text-center">
                <h3 className="text-lg font-serif font-bold text-foreground mb-2">TS Trần Thị C</h3>
                <span className="inline-flex items-center gap-1.5 text-xs text-secondary bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">
                  <span>🤖</span> AI Giám khảo
                </span>
              </div>

              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                <Mic className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs text-zinc-400 font-medium">TS Trần Thị C</span>
              </div>
            </div>

            {/* Floating User Picture-in-Picture */}
            <div className="absolute bottom-28 right-4 w-48 aspect-[4/3] bg-card rounded-xl border border-border shadow-2xl flex flex-col items-center justify-center overflow-hidden z-10">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary border border-primary/30">
                <Users className="w-5 h-5" />
              </div>
              <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2 py-1 rounded flex items-center gap-1.5">
                <Mic className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-zinc-300">Bạn (Sinh viên)</span>
              </div>
            </div>

            {/* Live Captions */}
            <div className="absolute bottom-4 left-0 right-0 px-4">
              <div className="bg-background/90 border border-primary/30 rounded-xl p-4 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-2">
                  <div className="bg-primary/20 p-1 rounded text-primary">
                    <MessageSquare className="w-3 h-3" />
                  </div>
                  <span className="text-[10px] font-bold text-primary tracking-wider uppercase">PHỤ ĐỀ TRỰC TIẾP — PGS.TS Nguyễn Văn B</span>
                </div>
                <p className="text-foreground text-sm font-medium leading-relaxed">
                  "Bạn có thể giải thích rõ hơn về kiến trúc <span className="text-primary font-semibold">Microservices</span> mà bạn đã đề cập trong chương 3 không? Cụ thể là cách xử lý đồng bộ giữa các service."
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Toolbar */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-background/80 backdrop-blur-md border-t border-border flex items-center justify-between px-6 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="w-32"></div> {/* Spacer */}
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleToggleRecord}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  isRecording 
                    ? "bg-red-500/20 border border-red-500 text-red-500 animate-pulse" 
                    : "bg-muted border border-border hover:bg-muted/80 text-foreground"
                }`}
              >
                <Mic className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-full bg-muted border border-border hover:bg-muted/80 flex items-center justify-center text-foreground transition-colors">
                <Video className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-full bg-muted border border-border hover:bg-muted/80 flex items-center justify-center text-foreground transition-colors">
                <MonitorUp className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-full bg-muted border border-border hover:bg-muted/80 flex items-center justify-center text-foreground transition-colors">
                <Hand className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-full bg-muted border border-border hover:bg-muted/80 flex items-center justify-center text-foreground transition-colors">
                <MoreHorizontal className="w-5 h-5" />
              </button>
              <button className="w-11 h-11 rounded-xl bg-primary/20 border border-primary/30 hover:bg-primary/30 flex items-center justify-center text-primary transition-colors ml-2">
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

        {/* Right Sidebar (Chat) */}
        <div className="w-[340px] bg-background/80 backdrop-blur-md border-l border-border flex flex-col h-full shadow-lg">
          
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button className="flex-1 py-4 text-xs font-bold text-primary border-b-2 border-primary flex items-center justify-center gap-2">
              <MessageSquare className="w-4 h-4" />
              TRÒ CHUYỆN
            </button>
            <button className="flex-1 py-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2">
              <Users className="w-4 h-4" />
              MỌI NGƯỜI (3)
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            
            <div className="flex items-center gap-4">
              <div className="h-px bg-border flex-1"></div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Phiên bắt đầu</span>
              <div className="h-px bg-border flex-1"></div>
            </div>

            {messages.map((msg, index) => {
              const isStudent = msg.sender_role === "student";
              const avatarColor = isStudent 
                ? "bg-primary/20 text-primary border-primary/30" 
                : "bg-secondary text-white border-secondary";
              const initials = msg.sender_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
              
              return (
                <div key={msg.id || index} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm mt-1 border ${avatarColor}`}>
                    {initials}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">{msg.sender_name}</span>
                      {msg.created_at && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm leading-relaxed ${isStudent ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chat Input */}
          <div className="p-4 border-t border-border">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Gửi tin nhắn tới mọi người..." 
                className="w-full bg-card border border-border rounded-full py-3 pl-4 pr-12 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground shadow-sm"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
              />
              <button 
                onClick={handleSendMessage}
                className="absolute right-1.5 top-1.5 w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center text-white transition-colors"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
