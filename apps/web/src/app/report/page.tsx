import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReportPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="text-center mb-14 animate-in fade-in slide-in-from-top-8 duration-700">
        <h1 className="text-5xl font-black tracking-tight text-gray-900 mb-4">Báo Cáo Đánh Giá</h1>
        <p className="text-xl text-gray-500">Kết quả tổng hợp từ phiên bảo vệ thử nghiệm của bạn.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
        <Card className="flex-1 bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-800 text-white shadow-2xl border-none overflow-hidden relative">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <CardHeader>
            <CardTitle className="text-blue-100 text-xl font-medium opacity-90">Điểm tổng kết</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-10">
            <div className="text-8xl font-black drop-shadow-lg tracking-tighter">
              8.5<span className="text-4xl text-blue-200 tracking-normal ml-1">/10</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex-[2] grid grid-cols-2 gap-5">
          <Card className="shadow-md border-gray-100 hover:border-blue-200 transition-colors">
            <CardHeader className="pb-2 bg-gray-50/50 rounded-t-xl"><CardTitle className="text-xs text-gray-500 font-bold uppercase tracking-widest">Kiến thức chuyên môn</CardTitle></CardHeader>
            <CardContent className="pt-4"><p className="text-4xl font-bold text-gray-900">9.0</p></CardContent>
          </Card>
          <Card className="shadow-md border-gray-100 hover:border-blue-200 transition-colors">
            <CardHeader className="pb-2 bg-gray-50/50 rounded-t-xl"><CardTitle className="text-xs text-gray-500 font-bold uppercase tracking-widest">Kỹ năng trình bày</CardTitle></CardHeader>
            <CardContent className="pt-4"><p className="text-4xl font-bold text-gray-900">7.5</p></CardContent>
          </Card>
          <Card className="shadow-md border-gray-100 hover:border-blue-200 transition-colors">
            <CardHeader className="pb-2 bg-gray-50/50 rounded-t-xl"><CardTitle className="text-xs text-gray-500 font-bold uppercase tracking-widest">Phản biện câu hỏi</CardTitle></CardHeader>
            <CardContent className="pt-4"><p className="text-4xl font-bold text-gray-900">8.0</p></CardContent>
          </Card>
          <Card className="shadow-md border-gray-100 hover:border-blue-200 transition-colors">
            <CardHeader className="pb-2 bg-gray-50/50 rounded-t-xl"><CardTitle className="text-xs text-gray-500 font-bold uppercase tracking-widest">Chất lượng đồ án</CardTitle></CardHeader>
            <CardContent className="pt-4"><p className="text-4xl font-bold text-gray-900">8.5</p></CardContent>
          </Card>
        </div>
      </div>

      <Card className="mb-10 shadow-xl border-gray-200 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
        <CardHeader className="bg-gray-50 border-b p-6">
          <CardTitle className="text-2xl text-gray-800">Nhận xét chi tiết từ Hội đồng AI</CardTitle>
        </CardHeader>
        <CardContent className="p-8 flex flex-col md:flex-row gap-8">
          <div className="flex-1 bg-green-50/50 p-6 rounded-2xl border border-green-100">
            <h4 className="text-xl font-bold text-green-700 mb-4 flex items-center gap-3 border-b border-green-200 pb-3">
              <span className="bg-green-200 text-green-800 w-8 h-8 rounded-full flex items-center justify-center text-sm">✓</span> 
              Điểm mạnh
            </h4>
            <ul className="space-y-3 text-gray-700 font-medium">
              <li className="flex gap-2"><span className="text-green-500">•</span>Nắm rất vững kiến trúc hệ thống và cách các module tương tác.</li>
              <li className="flex gap-2"><span className="text-green-500">•</span>Slide trình bày rõ ràng, đi thẳng vào vấn đề.</li>
              <li className="flex gap-2"><span className="text-green-500">•</span>Demo hoạt động trơn tru không có lỗi nghiêm trọng.</li>
            </ul>
          </div>
          <div className="flex-1 bg-orange-50/50 p-6 rounded-2xl border border-orange-100">
            <h4 className="text-xl font-bold text-orange-700 mb-4 flex items-center gap-3 border-b border-orange-200 pb-3">
              <span className="bg-orange-200 text-orange-800 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black">!</span> 
              Cần cải thiện
            </h4>
            <ul className="space-y-3 text-gray-700 font-medium">
              <li className="flex gap-2"><span className="text-orange-500">•</span>Câu trả lời phần bảo mật dữ liệu còn lúng túng, chưa thuyết phục.</li>
              <li className="flex gap-2"><span className="text-orange-500">•</span>Nói hơi nhanh ở phần đầu, cần điều chỉnh nhịp độ tự tin hơn.</li>
              <li className="flex gap-2"><span className="text-orange-500">•</span>Nên bổ sung thêm phần so sánh performance của giải pháp với các hệ thống khác.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      
      <div className="flex justify-center mt-12 pb-12 animate-in fade-in duration-1000 delay-300">
        <button className="px-10 py-4 bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-lg hover:shadow-xl font-bold text-lg transition-all hover:-translate-y-1 flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Tải xuống báo cáo PDF
        </button>
      </div>
    </div>
  );
}
