import { Button } from "@/components/ui/button";

export default function MockRoomPage() {
  return (
    <div className="flex-1 flex flex-col min-h-[calc(100vh-4rem)] bg-black animate-in fade-in duration-500">
      <div className="flex-1 flex flex-col lg:flex-row relative">
        {/* Main Video/Avatar Area */}
        <div className="flex-1 flex items-center justify-center p-4 lg:p-8 relative">
          <div className="w-full max-w-5xl aspect-video bg-gray-900 rounded-3xl border border-gray-800 shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 to-transparent"></div>
            
            {/* AI Avatar Placeholder */}
            <div className="w-32 h-32 lg:w-40 lg:h-40 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(59,130,246,0.6)] animate-pulse relative z-10 border-4 border-blue-400/30">
              <span className="text-5xl lg:text-6xl drop-shadow-md">🤖</span>
            </div>
            <div className="mt-8 text-center relative z-10">
              <h2 className="text-3xl font-bold text-white mb-3 tracking-wide">Giám khảo AI</h2>
              <p className="text-green-400 flex items-center justify-center gap-2 font-medium bg-green-900/20 px-4 py-1.5 rounded-full border border-green-500/30">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-ping"></span> Đang lắng nghe...
              </p>
            </div>
            
            {/* Subtitles / AI Speech */}
            <div className="absolute bottom-8 left-8 right-8 bg-black/70 backdrop-blur-md p-5 rounded-2xl border border-white/10 text-center shadow-2xl">
              <p className="text-white text-lg lg:text-xl font-medium leading-relaxed">
                "Bạn có thể giải thích rõ hơn về kiến trúc <span className="text-blue-400">Microservices</span> mà bạn đã đề cập trong chương 3 không?"
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar Controls */}
        <div className="w-full lg:w-[400px] bg-gray-950 border-l border-gray-800 p-6 flex flex-col z-20 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">
          <h3 className="text-white text-xl font-semibold mb-6 flex items-center gap-3 border-b border-gray-800 pb-4">
            <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"></span> Live Session
          </h3>
          
          <div className="flex-1 overflow-y-auto space-y-5 mb-6 pr-2 custom-scrollbar">
            <div className="bg-gray-800/60 p-4 rounded-2xl rounded-tl-sm border border-gray-700/50 shadow-sm">
              <p className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Giám khảo AI</p>
              <p className="text-sm text-gray-200 leading-relaxed">Chào bạn, chúng ta bắt đầu buổi bảo vệ nhé. Hãy tóm tắt về đồ án của bạn trong 3 phút.</p>
            </div>
            <div className="bg-blue-900/40 p-4 rounded-2xl rounded-tr-sm border border-blue-800/50 ml-8 shadow-sm">
              <p className="text-xs font-semibold text-blue-400 mb-1.5 uppercase tracking-wider text-right">Bạn (Transcript)</p>
              <p className="text-sm text-blue-100 leading-relaxed">Dạ vâng, thưa hội đồng. Đồ án của em tập trung vào việc ứng dụng AI trong...</p>
            </div>
          </div>

          <div className="space-y-6 bg-gray-900/50 p-6 rounded-2xl border border-gray-800">
            <div className="flex justify-center gap-5">
              <button className="w-14 h-14 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-white border border-gray-700 hover:border-gray-500 shadow-lg transition-all hover:scale-105 group">
                <span className="text-xl group-hover:text-blue-400 transition-colors">🎤</span>
              </button>
              <button className="w-14 h-14 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-white border border-gray-700 hover:border-gray-500 shadow-lg transition-all hover:scale-105 group">
                <span className="text-xl group-hover:text-blue-400 transition-colors">📹</span>
              </button>
              <button className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white shadow-lg transition-all hover:scale-105 border border-red-500">
                <span className="text-xl font-bold">✕</span>
              </button>
            </div>
            <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-6 rounded-xl text-lg font-bold shadow-xl hover:shadow-blue-500/25 transition-all border-none">
              Kết thúc & Xem báo cáo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
