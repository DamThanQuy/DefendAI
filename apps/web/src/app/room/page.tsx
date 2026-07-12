"use client";

import { useState, useEffect } from "react";
import {
  Mic, MicOff, Video, VideoOff, ScreenShare, MessageSquare,
  Users, PhoneOff, Settings, MoreHorizontal, Hand, Sparkles,
  Subtitles, Signal, Wifi, Clock
} from "lucide-react";

type Participant = {
  id: string;
  name: string;
  role: "ai" | "user";
  speaking: boolean;
};

export default function MockRoomPage() {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  const participants: Participant[] = [
    { id: "ai-1", name: "PGS.TS Nguyễn Văn B", role: "ai", speaking: true },
    { id: "ai-2", name: "TS Trần Thị C", role: "ai", speaking: false },
    { id: "user", name: "Bạn (Sinh viên)", role: "user", speaking: false },
  ];

  const speakers = participants.filter((p) => p.role === "ai");
  const self = participants.find((p) => p.role === "user")!;

  return (
    <div className="flex-1 flex flex-col bg-black min-h-[calc(100vh-72px)]">
      {/* Top Bar */}
      <div className="h-14 bg-background border-b border-border flex items-center justify-between px-4 lg:px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-critical animate-pulse shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
            <span className="text-foreground text-[13px] font-semibold font-mono uppercase tracking-wider">Live</span>
          </div>
          <div className="h-5 w-px bg-border" />
          <div>
            <h1 className="text-foreground text-[14px] font-semibold">Phòng bảo vệ đồ án — AI Mock Defense</h1>
            <div className="flex items-center gap-3 text-muted-foreground text-[11px] font-mono">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {mm}:{ss}
              </span>
              <span className="flex items-center gap-1">
                <Signal className="w-3 h-3" /> 240 kbps
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface rounded-full border border-border text-[12px] font-mono text-muted-foreground">
            <Users className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-foreground font-semibold">{participants.length}</span>/8
          </div>
          <button className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Stage — video grid */}
        <div className="flex-1 p-3 lg:p-4 flex flex-col gap-3 relative">
          {/* Speaker tiles */}
          <div className={`flex-1 grid gap-3 ${speakers.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
            {speakers.map((p) => (
              <div
                key={p.id}
                className={`relative bg-[#0a0a0f] rounded-2xl border overflow-hidden flex items-center justify-center ${
                  p.speaking ? "border-teal-500 shadow-[0_0_0_2px_rgba(13,148,136,0.4)]" : "border-border"
                } transition-all duration-200`}
              >
                {/* Avatar */}
                <div className="flex flex-col items-center">
                  <div className={`relative w-28 h-28 lg:w-36 lg:h-36 rounded-full bg-gradient-to-br ${
                    p.id === "ai-1"
                      ? "from-teal-500 via-cyan-500 to-indigo-600"
                      : "from-indigo-500 via-purple-500 to-teal-500"
                  } flex items-center justify-center shadow-glow ${p.speaking ? 'animate-pulse' : ''}`}>
                    <Sparkles className="w-12 h-12 lg:w-16 lg:h-16 text-white drop-shadow-md" />
                    {p.speaking && (
                      <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-teal-500 border-4 border-[#0a0a0f] flex items-center justify-center shadow-glow">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      </span>
                    )}
                  </div>
                  <div className="mt-5 text-center">
                    <h3 className="text-white text-base font-bold mb-1">{p.name}</h3>
                    <div className="flex items-center gap-1.5 justify-center text-teal-400 text-[12px] font-medium bg-teal-950/40 px-3 py-1 rounded-full border border-teal-900/50 font-mono">
                      <Sparkles className="w-3 h-3" /> AI Giám khảo
                    </div>
                  </div>
                </div>

                {/* Bottom-left name tag (Meet style) */}
                <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-[12px] font-medium">
                  <Mic className="w-3 h-3" />
                  <span>{p.name}</span>
                </div>
                <div className="absolute top-3 right-3 px-2 py-0.5 bg-teal-500/20 border border-teal-500/40 text-teal-300 rounded text-[10px] font-bold uppercase tracking-wider font-mono">
                  AI
                </div>
              </div>
            ))}
          </div>

          {/* Subtitle / Live transcript strip (Meet captions style) */}
          <div className="bg-black/80 backdrop-blur-md border border-teal-900/40 rounded-xl px-5 py-4 flex items-start gap-3 shadow-glow">
            <div className="shrink-0 w-8 h-8 rounded-full bg-teal-950/40 border border-teal-900/50 flex items-center justify-center">
              <Subtitles className="w-4 h-4 text-teal-400" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mb-1 font-mono">Phụ đề trực tiếp — PGS.TS Nguyễn Văn B</div>
              <p className="text-white text-[15px] leading-relaxed">
                &ldquo;Bạn có thể giải thích rõ hơn về kiến trúc <span className="text-teal-400 font-semibold">Microservices</span> mà bạn đã đề cập trong chương 3 không? Cụ thể là cách xử lý đồng bộ giữa các service.&rdquo;
              </p>
            </div>
          </div>

          {/* Self-view (PIP, Meet style) */}
          <div className="absolute bottom-3 right-3 lg:bottom-28 lg:right-4 w-40 lg:w-48 aspect-video bg-[#161B26] rounded-xl border border-border shadow-glow overflow-hidden z-10">
            {camOn ? (
              <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-teal-950/40 border border-teal-900/50 flex items-center justify-center">
                  <span className="text-2xl">👤</span>
                </div>
              </div>
            ) : (
              <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                <VideoOff className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <div className="absolute bottom-1.5 left-1.5 bg-black/70 backdrop-blur px-2 py-0.5 rounded text-[10px] text-white font-medium flex items-center gap-1">
              {micOn ? <Mic className="w-2.5 h-2.5" /> : <MicOff className="w-2.5 h-2.5 text-critical" />}
              {self.name}
            </div>
          </div>
        </div>

        {/* Sidebar — Chat / People */}
        {chatOpen && (
          <div className="w-full lg:w-[360px] bg-background border-l border-border flex flex-col shrink-0">
            {/* Tabs */}
            <div className="flex border-b border-border shrink-0">
              <button className="flex-1 py-3 text-[13px] font-semibold text-teal-400 border-b-2 border-teal-500 font-mono uppercase tracking-wider flex items-center justify-center gap-2">
                <MessageSquare className="w-4 h-4" /> Trò chuyện
              </button>
              <button className="flex-1 py-3 text-[13px] font-semibold text-muted-foreground hover:text-foreground border-b-2 border-transparent font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-colors duration-200">
                <Users className="w-4 h-4" /> Mọi người ({participants.length})
              </button>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-center text-[10px] text-muted-foreground font-mono uppercase tracking-wider py-2">
                — Phiên bắt đầu lúc 14:32 —
              </div>

              <div className="flex gap-2.5">
                <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                  NB
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[12px] font-semibold text-foreground">PGS.TS Nguyễn Văn B</span>
                    <span className="text-[10px] text-muted-foreground font-mono">14:32</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    Chào bạn, chúng ta bắt đầu buổi bảo vệ nhé. Hãy tóm tắt về đồ án của bạn trong 3 phút.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <div className="w-8 h-8 shrink-0 rounded-full bg-indigo-500/20 border border-indigo-900/50 flex items-center justify-center text-indigo-300 text-xs font-bold">
                  TC
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[12px] font-semibold text-foreground">TS Trần Thị C</span>
                    <span className="text-[10px] text-muted-foreground font-mono">14:33</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    Tốt. Mình sẽ chú ý phần phân tích kết quả thực nghiệm nhé.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <div className="w-8 h-8 shrink-0 rounded-full bg-teal-950/40 border border-teal-900/50 flex items-center justify-center text-teal-300 text-xs font-bold">
                  B
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[12px] font-semibold text-foreground">Bạn</span>
                    <span className="text-[10px] text-muted-foreground font-mono">14:34</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    Dạ vâng, thưa hội đồng. Đồ án của em tập trung vào việc ứng dụng AI trong phân tích mã nguồn...
                  </p>
                </div>
              </div>
            </div>

            {/* Chat input */}
            <div className="p-3 border-t border-border shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Gửi tin nhắn tới mọi người..."
                  className="flex-1 bg-surface border border-border rounded-full px-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <button className="w-9 h-9 rounded-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white flex items-center justify-center hover:brightness-110 active:scale-[0.98] shadow-glow transition-all duration-200">
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar — Google Meet style */}
      <div className="h-20 bg-background border-t border-border flex items-center justify-center gap-2 px-4 shrink-0">
        <div className="flex items-center gap-2">
          {/* Mic */}
          <button
            onClick={() => setMicOn(!micOn)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${
              micOn
                ? "bg-surface border border-border text-foreground hover:border-teal-700 hover:text-teal-400"
                : "bg-critical border border-critical-border text-white"
            }`}
            title={micOn ? "Tắt mic" : "Bật mic"}
          >
            {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Cam */}
          <button
            onClick={() => setCamOn(!camOn)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${
              camOn
                ? "bg-surface border border-border text-foreground hover:border-teal-700 hover:text-teal-400"
                : "bg-critical border border-critical-border text-white"
            }`}
            title={camOn ? "Tắt camera" : "Bật camera"}
          >
            {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* Screen share */}
          <button
            className="w-11 h-11 rounded-full bg-surface border border-border text-foreground hover:border-teal-700 hover:text-teal-400 flex items-center justify-center transition-all duration-200"
            title="Chia sẻ màn hình"
          >
            <ScreenShare className="w-5 h-5" />
          </button>

          {/* Hand */}
          <button className="w-11 h-11 rounded-full bg-surface border border-border text-foreground hover:border-teal-700 hover:text-teal-400 flex items-center justify-center transition-all duration-200" title="Giơ tay">
            <Hand className="w-5 h-5" />
          </button>

          {/* More */}
          <button className="w-11 h-11 rounded-full bg-surface border border-border text-foreground hover:border-teal-700 hover:text-teal-400 flex items-center justify-center transition-all duration-200" title="Thêm">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>

        <div className="w-px h-8 bg-border mx-2" />

        {/* Chat toggle */}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${
            chatOpen
              ? "bg-teal-950/40 border border-teal-900/50 text-teal-400 shadow-glow"
              : "bg-surface border border-border text-foreground hover:border-teal-700 hover:text-teal-400"
          }`}
          title="Trò chuyện"
        >
          <MessageSquare className="w-5 h-5" />
        </button>

        <div className="absolute right-4 lg:right-8 flex items-center gap-2">
          {/* Leave — Red button (Meet style) */}
          <button className="h-11 px-5 rounded-full bg-critical hover:brightness-110 active:scale-[0.98] text-white font-semibold text-[13px] flex items-center gap-2 shadow-[0_0_20px_rgba(248,113,113,0.3)] transition-all duration-200">
            <PhoneOff className="w-4 h-4" />
            Rời phòng
          </button>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272A; border-radius: 3px; }
      `}</style>
    </div>
  );
}
