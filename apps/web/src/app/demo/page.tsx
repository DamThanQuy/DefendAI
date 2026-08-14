import React from "react";
import { FileText, MonitorPlay, FileSearch, MessageSquare, Mic } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Mock data — tái hiện giao diện app cho khách xem trước               */
/* ------------------------------------------------------------------ */

const mockDocs = [
  { id: 1, filename: "Bao_cao_do_an_tot_nghiep.pdf", type: "PDF", date: "24/10/2024 14:30", status: "completed" },
  { id: 2, filename: "Slide_Bao_Ve_Final.pptx", type: "PPTX", date: "24/10/2024 14:32", status: "completed" },
  { id: 3, filename: "Source_Code_Do_An.zip", type: "ZIP", date: "24/10/2024 15:01", status: "processing" },
  { id: 4, filename: "De_Thi_Tham_Khao.docx", type: "DOCX", date: "25/10/2024 09:12", status: "uploaded" },
];

const statusLabel: Record<string, string> = {
  uploaded: "Đã tải lên",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  failed: "Thất bại",
};

const statusColor: Record<string, string> = {
  uploaded: "text-blue-400 bg-blue-500/10",
  processing: "text-yellow-400 bg-yellow-500/10",
  completed: "text-green-400 bg-green-500/10",
  failed: "text-red-400 bg-red-500/10",
};

const diffCfg: Record<string, { label: string; bg: string; txt: string }> = {
  easy: { label: "Dễ", bg: "bg-green-500/10", txt: "text-green-400" },
  medium: { label: "Trung bình", bg: "bg-blue-500/10", txt: "text-blue-400" },
  hard: { label: "Khó", bg: "bg-red-500/10", txt: "text-red-400" },
};

const mockQuestions = [
  {
    id: 1,
    diff: "medium",
    persona: "Giám khảo kỹ thuật",
    q: "Giải thích cách phân chia module trong kiến trúc phần mềm của bạn?",
    hint: "Nêu rõ trách nhiệm của từng module, cách chúng giao tiếp với nhau và lý do lựa chọn kiến trúc này.",
  },
  {
    id: 2,
    diff: "hard",
    persona: "Phản biện",
    q: "Hệ thống có scale tốt khi đạt 10.000 bản ghi không? Bạn đã kiểm thử chưa?",
    hint: "Trình bày số liệu benchmark, chỉ số latency, và hướng tối ưu nếu dữ liệu tăng gấp 10 lần.",
  },
  {
    id: 3,
    diff: "easy",
    persona: "Giám khảo công nghệ",
    q: "Thiếu null-check tại analyzer.ts:12 có nguy hiểm không?",
    hint: "Phân tích hậu quả khi dữ liệu null xuất hiện và cách phòng ngừa bằng optional chaining.",
  },
];

const mockFileTree = [
  { name: "main.py", count: 2 },
  { name: "utils/db.py", count: 5 },
  { name: "app/routes.py", count: 0 },
  { name: "models/user.py", count: 3 },
];

const mockIssues = [
  { sev: "critical", type: "NullPointer", line: 12, file: "main.py", desc: "Có thể truy cập thuộc tính trên None" },
  { sev: "medium", type: "N+1 Query", line: 41, file: "utils/db.py", desc: "Truy vấn lặp trong vòng lặp — chậm khi dữ liệu lớn" },
  { sev: "low", type: "Magic Number", line: 7, file: "utils/db.py", desc: "Sử dụng hằng số ẩn, nên đặt tên rõ ràng" },
];

/** Khung thẻ mockup UI. */
function WindowFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card rounded-2xl border border-zinc-800/60 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export default function DemoPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-12">
      {/* Giao diện thực tế — tái hiện app sau khi đăng nhập */}
      <section className="py-16">
        <div className="text-center mb-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
            <MonitorPlay className="h-4 w-4" /> Giao diện thực tế
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Đây chính là những gì bạn sẽ thấy</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Sau khi đăng nhập, bạn có ngay các công cụ này — đúng giao diện, đúng trải nghiệm.
          </p>
        </div>

        {/* 1. Documents — bảng tài liệu */}
        <div className="mb-20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" /> Tài liệu của tôi
              </h3>
              <p className="text-zinc-500 text-[14px] mt-1">Tải lên, phân tích và theo dõi trạng thái từng tài liệu.</p>
            </div>
            <span className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-semibold">
              + Tải lên tài liệu mới
            </span>
          </div>
          <WindowFrame>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-800/60 bg-zinc-800/40">
                    <th className="px-5 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Tên file</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Loại</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Ngày tải lên</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Trạng thái</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {mockDocs.map((doc) => (
                    <tr key={doc.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-teal-400" />
                          </div>
                          <span className="text-[14px] font-semibold text-zinc-200 truncate max-w-[280px]">{doc.filename}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[12px] font-bold text-zinc-400 bg-zinc-800 px-2 py-1 rounded">{doc.type}</span>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-zinc-500">{doc.date}</td>
                      <td className="px-5 py-4">
                        <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full ${statusColor[doc.status]}`}>
                          {statusLabel[doc.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="px-3 py-1.5 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg">
                          Xem câu hỏi
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </WindowFrame>
        </div>

        {/* 2. Code Review + Câu hỏi AI — 2 cột */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-20">
          {/* Code Review */}
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
              <FileSearch className="w-5 h-5 text-primary" /> Code Review AI
            </h3>
            <WindowFrame>
              <div className="p-5">
                {/* Stats */}
                <div className="grid grid-cols-1 gap-3 mb-5">
                  <div className="bg-zinc-800/40 rounded-xl p-4 border border-zinc-800/60">
                    <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Lỗi nghiêm trọng</div>
                    <div className="text-[24px] font-bold text-red-400 mt-1">3</div>
                  </div>
                </div>

                {/* File tree */}
                <div className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Files</div>
                <div className="mb-5">
                  {mockFileTree.map((f) => (
                    <div key={f.name} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-zinc-400">
                      <span className="text-[12px]">{f.name.endsWith(".py") ? "🐍" : "📁"}</span>
                      <span className="truncate flex-1">{f.name}</span>
                      {f.count > 0 && (
                        <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          {f.count}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Issues */}
                <div className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Lỗi tìm thấy</div>
                <div className="space-y-2">
                  {mockIssues.map((i, idx) => {
                    const c = i.sev === "critical" ? "bg-red-500/10 text-red-400" : i.sev === "medium" ? "bg-orange-500/10 text-orange-400" : "bg-green-500/10 text-green-400";
                    const l = i.sev === "critical" ? "CRITICAL" : i.sev === "medium" ? "WARNING" : "OPTIMIZATION";
                    return (
                      <div key={idx} className="bg-zinc-900/40 rounded-lg px-3 py-2.5 border border-zinc-800/60 flex items-start gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0 ${c}`}>{l}</span>
                        <div className="min-w-0">
                          <p className="text-[12px] text-zinc-300 font-medium truncate">{i.type} — {i.file}:{i.line}</p>
                          <p className="text-[11px] text-zinc-500 truncate">{i.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </WindowFrame>
          </div>

          {/* Câu hỏi AI */}
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
              <MessageSquare className="w-5 h-5 text-primary" /> Câu hỏi phản biện AI
            </h3>
            <WindowFrame>
              <div className="p-5 space-y-4">
                {mockQuestions.map((q) => {
                  const d = diffCfg[q.diff];
                  return (
                    <div key={q.id} className="bg-zinc-900/40 rounded-xl border border-zinc-800/60 p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`px-2.5 py-1 ${d.bg} ${d.txt} text-[11px] font-bold rounded-full`}>{d.label}</span>
                        <span className="px-2.5 py-1 bg-zinc-800 text-zinc-300 text-[11px] font-bold rounded-full">{q.persona}</span>
                      </div>
                      <h4 className="text-[14px] font-bold text-teal-400 leading-snug mb-2">{q.q}</h4>
                      <div className="bg-zinc-800/40 rounded-lg px-3 py-2 flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-primary">💡 Gợi ý trả lời</span>
                      </div>
                      <p className="text-[12px] text-zinc-500 mt-2 leading-relaxed">{q.hint}</p>
                    </div>
                  );
                })}
              </div>
            </WindowFrame>
          </div>
        </div>

        {/* 3. Mock Room — Phòng bảo vệ ảo */}
        <div className="max-w-3xl mx-auto">
          <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
            <MonitorPlay className="w-5 h-5 text-primary" /> Mock Room — Phòng bảo vệ ảo
          </h3>
          <WindowFrame>
            <div className="p-5">
              {/* Hội đồng */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-zinc-900/40 rounded-xl border border-zinc-800/60 p-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto mb-2">
                    <Mic className="w-5 h-5" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-200">PGS.TS Nguyễn Văn B</p>
                  <p className="text-[10px] text-zinc-500">Chủ tịch hội đồng</p>
                  <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-bold text-red-400 bg-red-500/10 rounded">● LIVE</span>
                </div>
                <div className="bg-zinc-900/40 rounded-xl border border-zinc-800/60 p-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto mb-2">
                    <Mic className="w-5 h-5" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-200">TS Trần Thị C</p>
                  <p className="text-[10px] text-zinc-500">Phản biện</p>
                  <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500 bg-zinc-800 rounded">Muted</span>
                </div>
                <div className="bg-zinc-900/40 rounded-xl border border-zinc-800/60 p-3 text-center flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-2">
                    <span className="text-lg">👤</span>
                  </div>
                  <p className="text-[11px] font-bold text-zinc-200">Bạn (Sinh viên)</p>
                  <p className="text-[10px] text-zinc-500">Đang trình bày</p>
                </div>
              </div>
              {/* Chat */}
              <div className="bg-zinc-900/40 rounded-lg border border-zinc-800/60 p-3 mb-4">
                <p className="text-[11px] font-semibold text-teal-400 mb-1">PGS.TS Nguyễn Văn B</p>
                <p className="text-[12px] text-zinc-300 leading-relaxed">
                  Hãy trình bày kết quả của bạn — bạn có 10 phút cho phần báo cáo.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500">⏱ 08:42</span>
                <span className="text-[11px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">3 / 8</span>
                <span className="ml-auto px-3 py-1.5 bg-primary text-primary-foreground text-[11px] font-semibold rounded-full">🎙 Trả lời</span>
              </div>
            </div>
          </WindowFrame>
        </div>
      </section>
    </div>
  );
}
