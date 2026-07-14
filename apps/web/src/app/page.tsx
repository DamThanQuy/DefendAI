"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { FileText, MonitorPlay, Award, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 -left-1/4 w-[150%] h-full bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15),transparent_50%)] pointer-events-none" />

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 px-4 z-10 flex flex-col items-center justify-center min-h-[85vh]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="container mx-auto text-center max-w-4xl"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-8 backdrop-blur-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </span>
            Hệ thống AI Mock Defense thế hệ mới
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-8 leading-[1.1] text-foreground">
            Bảo vệ đồ án với <br />
            <span className="text-gradient">sự tự tin tuyệt đối</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto font-medium mb-12">
            Trải nghiệm nền tảng AI thông minh giúp phân tích, tạo câu hỏi phản biện và mô phỏng phòng bảo vệ đồ án như thật.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/upload">
              <Button className="rounded-full h-14 px-8 text-lg shadow-[0_0_20px_hsl(var(--primary)/0.5)] transition-all hover:scale-105 group relative overflow-hidden">
                <span className="relative z-10 flex items-center gap-2">
                  Trải nghiệm ngay
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent opacity-0 group-hover:opacity-100 transition-opacity z-0" />
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" className="rounded-full h-14 px-8 text-lg transition-all">
                Khám phá tính năng
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 relative z-10">
        <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Tính năng nổi bật</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Mọi công cụ bạn cần để đạt điểm tối đa.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <motion.div
              whileHover={{ y: -10 }}
              className="feature-card rounded-3xl p-8 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[50px] rounded-full group-hover:bg-primary/20 transition-colors" />
              <div className="w-14 h-14 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mb-6 shadow-inner">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold mb-3">Phân Tích AI Sâu</h3>
              <p className="text-muted-foreground leading-relaxed">
                Tự động trích xuất nội dung, tìm ra lỗ hổng logic và dự đoán hàng loạt câu hỏi hội đồng có thể đặt ra cho đồ án của bạn.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              whileHover={{ y: -10 }}
              className="feature-card rounded-3xl p-8 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-[50px] rounded-full group-hover:bg-accent/20 transition-colors" />
              <div className="w-14 h-14 rounded-2xl bg-accent/20 text-accent flex items-center justify-center mb-6 shadow-inner">
                <MonitorPlay className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold mb-3">Mock Room</h3>
              <p className="text-muted-foreground leading-relaxed">
                Giả lập phòng bảo vệ thực tế với đồng hồ bấm giờ, không khí hội đồng và phản biện trực tiếp từ giám khảo AI.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              whileHover={{ y: -10 }}
              className="feature-card rounded-3xl p-8 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] rounded-full group-hover:bg-purple-500/20 transition-colors" />
              <div className="w-14 h-14 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-6 shadow-inner">
                <Award className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold mb-3">Chấm Điểm & Báo Cáo</h3>
              <p className="text-muted-foreground leading-relaxed">
                Hệ thống chấm điểm chuẩn mực theo rubric, cung cấp file PDF báo cáo chi tiết giúp bạn cải thiện ngay lập tức.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative z-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="liquid-glass rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden border-primary/20 shadow-[0_0_50px_rgba(99,102,241,0.1)]">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Sẵn sàng toả sáng?</h2>
            <p className="text-muted-foreground text-lg mb-10 max-w-2xl mx-auto">
              Hàng ngàn sinh viên đã chuẩn bị hoàn hảo với GraduAI. Đừng để sự cố nhỏ làm hỏng điểm số của bạn.
            </p>
            <Link href="/upload">
              <Button size="lg" className="rounded-full h-14 px-10 text-lg shadow-[0_0_20px_hsl(var(--primary)/0.6)] hover:scale-105 transition-transform">
                Bắt đầu hoàn toàn miễn phí
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
