import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CodeReviewPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="mb-12 text-center animate-in fade-in zoom-in duration-500">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-4">Code Review <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">AI</span></h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto">
          Hệ thống AI đã phân tích mã nguồn của bạn. Dưới đây là các lỗ hổng, lỗi tiềm ẩn và đề xuất tối ưu hóa.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Card className="bg-red-50 border-red-100 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-700 text-lg">Lỗi nghiêm trọng (Critical)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-5xl font-black text-red-600">2</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-100 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-yellow-700 text-lg">Cảnh báo (Warnings)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-5xl font-black text-yellow-600">8</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-100 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-green-700 text-lg">Tối ưu (Optimization)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-5xl font-black text-green-600">14</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg border-gray-200 animate-in fade-in slide-in-from-bottom-8 duration-1000 overflow-hidden">
        <CardHeader className="bg-gray-50/80 border-b">
          <CardTitle>Chi tiết các vấn đề</CardTitle>
          <CardDescription>File: <span className="font-mono text-blue-600">src/services/api.js</span></CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-6 border-b hover:bg-gray-50/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-md">Critical</span>
              <h4 className="font-semibold text-lg">SQL Injection Vulnerability</h4>
            </div>
            <p className="text-sm text-gray-600 mb-4">Lỗi nối chuỗi trực tiếp trong câu query SQL. Hãy sử dụng parameterized queries hoặc ORM để bảo mật dữ liệu.</p>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-sm overflow-x-auto shadow-inner">
              <div className="text-red-400 line-through opacity-80">- const query = "SELECT * FROM users WHERE id = " + userId;</div>
              <div className="text-green-400 font-bold mt-1">+ const query = "SELECT * FROM users WHERE id = ?";</div>
            </div>
          </div>
          <div className="p-6 hover:bg-gray-50/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-md">Warning</span>
              <h4 className="font-semibold text-lg">Missing Error Handling</h4>
            </div>
            <p className="text-sm text-gray-600">Hàm fetch API không có khối try-catch, có thể làm crash ứng dụng nếu server phản hồi lỗi.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
