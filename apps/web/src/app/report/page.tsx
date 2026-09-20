"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Search,
  Filter,
  ChevronRight,
  Sparkles,
  Bot,
  Users
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Report {
  id: number;
  title: string;
  description: string;
  status: "pending" | "in_review" | "completed";
  ai_score: number;
  mentor_count: number;
  created_at: string;
  updated_at: string;
}

export default function ReportPage() {
  const [selectedProject, setSelectedProject] = useState<Report | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "in_review" | "completed">("all");

  // Mock data - sẽ thay bằng API call
  const reports: Report[] = [
    {
      id: 1,
      title: "Hệ thống bảo vệ dữ liệu cho ứng dụng FinTech",
      description: "Hệ thống bảo mật dữ liệu tài chính với AES-256 encryption và role-based access control",
      status: "completed",
      ai_score: 92,
      mentor_count: 3,
      created_at: "2026-09-15T10:00:00Z",
      updated_at: "2026-09-18T14:30:00Z"
    },
    {
      id: 2,
      title: "AI Chatbot hỗ trợ khách hàng",
      description: "Chatbot sử dụng NLP để hỗ trợ khách hàng 24/7 với khả năng trả lời câu hỏi thường gặp",
      status: "in_review",
      ai_score: 85,
      mentor_count: 2,
      created_at: "2026-09-16T09:00:00Z",
      updated_at: "2026-09-18T10:00:00Z"
    },
    {
      id: 3,
      title: "E-commerce Platform với AI Recommendation",
      description: "Nền tảng thương mại điện tử tích hợp AI recommendation system",
      status: "pending",
      ai_score: 0,
      mentor_count: 0,
      created_at: "2026-09-17T11:00:00Z",
      updated_at: "2026-09-17T11:00:00Z"
    }
  ];

  const filteredReports = reports.filter(report => {
    const matchesSearch = report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         report.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || report.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: Report["status"]) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Hoàn thành</Badge>;
      case "in_review":
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Đang xem xét</Badge>;
      case "pending":
        return <Badge className="bg-zinc-500/10 text-zinc-600 border-zinc-500/20">Chờ xử lý</Badge>;
    }
  };

  const getAiFeedback = (score: number) => {
    if (score >= 80) return "Tuyệt vời! Dự án đạt điểm cao.";
    if (score >= 60) return "Khá tốt! Dự án có nhiều điểm mạnh.";
    if (score >= 40) return "Cần cải thiện thêm.";
    return "Cần nỗ lực hơn.";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="border-b bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Báo cáo & Đánh giá</h1>
              <p className="mt-1 text-muted-foreground">
                Xem đánh giá AI và phản biện từ các mentor cho các dự án của bạn
              </p>
            </div>
            <Button className="gap-2 bg-gradient-to-r from-primary to-secondary">
              <Sparkles className="h-4 w-4" />
              Tạo báo cáo mới
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Project List */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search and Filter */}
            <Card className="border-border/50 bg-background/50 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Tìm kiếm dự án..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => setFilterStatus("all")}
                  >
                    <Filter className="h-4 w-4" />
                    Lọc
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Project List */}
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {filteredReports.map((report) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card
                      className={`cursor-pointer transition-all hover:shadow-lg hover:shadow-primary/10 ${
                        selectedProject?.id === report.id
                          ? "ring-2 ring-primary/50"
                          : "border-border/50"
                      }`}
                      onClick={() => setSelectedProject(report)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-primary" />
                              <h3 className="text-lg font-semibold text-foreground">
                                {report.title}
                              </h3>
                              {getStatusBadge(report.status)}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {report.description}
                            </p>
                            <div className="flex items-center gap-6 text-sm">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                <span className="text-muted-foreground">Điểm AI: {report.ai_score}/100</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-amber-500" />
                                <span className="text-muted-foreground">
                                  {new Date(report.updated_at).toLocaleDateString("vi-VN")}
                                </span>
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Column - AI Score Summary */}
          <div className="space-y-4">
            <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-secondary/5 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  Tổng quan AI
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Đánh giá trung bình từ AI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center space-y-4">
                  <div className="relative inline-block">
                    <svg className="h-32 w-32 transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        className="text-border"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="url(#gradient1)"
                        strokeWidth="8"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray="351.86"
                        strokeDashoffset={351.86 - (351.86 * 59) / 100}
                      />
                      <defs>
                        <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#14B8A6" />
                          <stop offset="100%" stopColor="#06B6D4" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold text-foreground">59</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Điểm trung bình: 59/100
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-background/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Users className="h-5 w-5 text-secondary" />
                  Thống kê
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Tổng số báo cáo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tổng dự án</span>
                    <span className="text-lg font-semibold text-foreground">{reports.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Đã hoàn thành</span>
                    <span className="text-lg font-semibold text-emerald-600">
                      {reports.filter(r => r.status === "completed").length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Đang xem xét</span>
                    <span className="text-lg font-semibold text-amber-600">
                      {reports.filter(r => r.status === "in_review").length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Chờ xử lý</span>
                    <span className="text-lg font-semibold text-zinc-600">
                      {reports.filter(r => r.status === "pending").length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedProject(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-background border border-border shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
                <div className="flex items-center justify-between px-6 py-4">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">{selectedProject.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(selectedProject.updated_at).toLocaleDateString("vi-VN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric"
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedProject(null)}
                  >
                    <AlertCircle className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* AI Score */}
                <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-secondary/5">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Bot className="h-5 w-5 text-primary" />
                      Đánh giá AI
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6">
                      <div className="relative">
                        <svg className="h-24 w-24 transform -rotate-90">
                          <circle
                            cx="48"
                            cy="48"
                            r="40"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="none"
                            className="text-border"
                          />
                          <circle
                            cx="48"
                            cy="48"
                            r="40"
                            stroke="url(#gradient2)"
                            strokeWidth="8"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray="251.33"
                            strokeDashoffset={251.33 - (251.33 * selectedProject.ai_score) / 100}
                          />
                          <defs>
                            <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#14B8A6" />
                              <stop offset="100%" stopColor="#06B6D4" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-bold text-foreground">
                            {selectedProject.ai_score}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Điểm AI: {selectedProject.ai_score}/100
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {getAiFeedback(selectedProject.ai_score)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Mentor Reviews */}
                <Card className="border-border/50 bg-background/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Users className="h-5 w-5 text-secondary" />
                      Phản biện từ Mentor
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      {selectedProject.mentor_count} mentor đã xem xét dự án này
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Array.from({ length: selectedProject.mentor_count }).map((_, mentor) => (
                        <div key={mentor} className="p-4 rounded-lg border border-border/50 bg-muted/30">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-semibold">
                                {String.fromCharCode(65 + mentor)}
                              </span>
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-foreground">
                                  Mentor {mentor + 1}
                                </h4>
                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                  Hoàn thành
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Dự án có kiến thức nền tảng tốt, nhưng cần cải thiện phần bảo mật.
                              </p>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-muted-foreground">
                                  Điểm: {85 + mentor * 2}/100
                                </span>
                                <span className="text-muted-foreground">
                                  {new Date().toLocaleDateString("vi-VN")}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex gap-4">
                  <Button className="flex-1 bg-gradient-to-r from-primary to-secondary">
                    Xem chi tiết
                  </Button>
                  <Button variant="outline" className="flex-1">
                    Tải xuống báo cáo
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
