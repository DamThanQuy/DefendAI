"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Search,
  FileText,
  MonitorPlay,
  Award,
  Sparkles,
  CheckCircle2,
  Trophy,
  Smartphone,
  BookOpen,
  Code2,
  GitBranch,
  Zap,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const STATS = [
  { value: "8.019+", label: "Câu hỏi phản biện", icon: FileText },
  { value: "92+", label: "Đồ án đã phân tích", icon: Trophy },
  { value: "30+", label: "Chuyên ngành", icon: BookOpen },
  { value: "943+", label: "Sinh viên tin dùng", icon: GraduationCap },
];

const STEPS = [
  {
    num: "01",
    icon: FileText,
    title: "Upload đồ án",
    desc: "Tải lên file PDF, Word hoặc link GitHub. Hệ thống tự động trích xuất nội dung trong vài giây.",
  },
  {
    num: "02",
    icon: Zap,
    title: "AI phân tích",
    desc: "AI đánh giá logic, code, cấu trúc — dự đoán hàng trăm câu hỏi hội đồng có thể đặt ra.",
  },
  {
    num: "03",
    icon: MonitorPlay,
    title: "Mock defense",
    desc: "Luyện tập trong phòng bảo vệ mô phỏng với giám khảo AI và nhận báo cáo chi tiết.",
  },
];

const FEATURES = [
  {
    icon: Code2,
    title: "Phân tích code chuyên sâu",
    desc: "Tự động review code, phát hiện bug, anti-pattern và đề xuất cải thiện theo chuẩn ngành.",
  },
  {
    icon: GitBranch,
    title: "Đánh giá theo rubric",
    desc: "Chấm điểm chi tiết theo từng tiêu chí của hội đồng: logic, thực tiễn, trình bày, hàm lượng.",
  },
  {
    icon: Smartphone,
    title: "Tối ưu mọi thiết bị",
    desc: "Luyện tập trên điện thoại, tablet hay laptop — giao diện tự thích nghi mượt mà.",
  },
];

const UNIVERSITIES = ["FPT", "DNTU", "UEH", "FTU2", "HCMUT", "VNU-UET"];

export default function LandingPage() {
  const { isAuthed } = useAuth();
  const startHref = isAuthed ? "/documents" : "/register";

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/10 blur-[120px] rounded-full -z-10" />
      <div className="absolute top-[60%] right-0 w-[500px] h-[500px] bg-secondary/10 blur-[100px] rounded-full -z-10" />
      <div className="absolute top-[40%] left-0 w-[400px] h-[400px] bg-accent/8 blur-[100px] rounded-full -z-10" />

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 px-4 z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="container mx-auto text-center max-w-4xl"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-8 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Nền tảng AI Mock Defense thế hệ mới
          </div>

          <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tight mb-6 leading-[1.05] text-foreground">
            Chủ động đồ án. <br />
            <span className="text-gradient">Làm chủ tương lai.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto font-medium mb-10">
            Nền tảng AI mô phỏng phòng bảo vệ đồ án thực tế — giúp sinh viên
            luyện tập phản biện, nhận diện lỗ hổng và tự tin trước hội đồng.
          </p>

          {/* Search-like CTA — Qiz HUB style */}
          <div className="max-w-2xl mx-auto mb-8">
            <Link href={startHref}>
              <div className="group relative flex items-center gap-3 p-2 rounded-full border border-border bg-card/80 backdrop-blur-sm shadow-lg shadow-primary/5 hover:border-primary/40 transition-all cursor-pointer">
                <div className="flex items-center gap-2 pl-5 flex-1 text-muted-foreground">
                  <Search className="w-5 h-5" />
                  <span className="text-sm md:text-base">
                    Upload đồ án đầu tiên của bạn — AI sẽ phân tích miễn phí...
                  </span>
                </div>
                <Button className="rounded-full px-6 h-12 group-hover:scale-[1.02] transition-transform">
                  Bắt đầu
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/demo">
              <Button variant="outline" className="rounded-full h-12 px-6">
                <Sparkles className="w-4 h-4 mr-2" />
                Xem demo không cần đăng ký
              </Button>
            </Link>
            <Link href="#how">
              <Button variant="ghost" className="rounded-full h-12 px-6">
                Cách hoạt động
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Stats */}
      <section className="relative z-10 pb-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map((s, idx) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 + idx * 0.05 }}
                className="dark-card rounded-2xl p-5 flex flex-col items-start gap-2 hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div className="text-3xl font-black text-gradient">{s.value}</div>
                </div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trusted by */}
      <section className="relative z-10 pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Được tin dùng bởi sinh viên từ
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
            {UNIVERSITIES.map((u) => (
              <span
                key={u}
                className="text-lg md:text-xl font-extrabold tracking-tight text-muted-foreground hover:text-foreground transition-colors"
              >
                {u}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — 3 steps */}
      <section id="how" className="py-20 relative z-10">
        <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold uppercase tracking-wider mb-4">
              Cách hoạt động
            </div>
            <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">
              Luyện bảo vệ thông minh, <br className="hidden md:block" />
              3 bước đơn giản
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Từ upload đồ án đến nhận báo cáo chi tiết — tất cả chỉ trong vài phút.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step, idx) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                whileHover={{ y: -6 }}
                className="dark-card rounded-2xl p-7 relative overflow-hidden group"
              >
                <div className="absolute -top-4 -right-2 text-[8rem] font-black text-primary/5 leading-none select-none">
                  {step.num}
                </div>
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground flex items-center justify-center mb-5 shadow-lg shadow-primary/20">
                    <step.icon className="w-7 h-7" />
                  </div>
                  <div className="text-xs font-bold text-primary mb-2 tracking-wider">
                    BƯỚC {step.num}
                  </div>
                  <h3 className="text-xl font-bold mb-2 font-serif">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 relative z-10">
        <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4">
              Tại sao chọn GraduAI
            </div>
            <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">
              Thiết kế cho buổi bảo vệ <br className="hidden md:block" />
              thực sự thành công
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((f, idx) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                whileHover={{ y: -6 }}
                className="feature-card group"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[50px] rounded-full group-hover:bg-primary/20 transition-colors" />
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center mb-5">
                    <f.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo preview */}
      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="dark-card rounded-3xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] rounded-full" />
            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-bold uppercase tracking-wider mb-4">
                  <Sparkles className="w-3.5 h-3.5" />
                  Demo không cần đăng ký
                </div>
                <h3 className="text-3xl md:text-4xl font-serif font-bold mb-3">
                  AI hỏi như hội đồng thật
                </h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Xem ngay 1 kết quả mẫu: câu hỏi phản biện, nhận xét năng lực
                  và đánh giá đồ án theo rubric chuẩn.
                </p>
                <Link href="/demo">
                  <Button className="rounded-full group">
                    Xem demo đầy đủ
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
              <div className="grid gap-3">
                <div className="dark-card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <p className="text-sm font-semibold text-primary">Kiến trúc</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Giải thích cách phân chia module và lý do chọn microservices?
                  </p>
                </div>
                <div className="dark-card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-secondary" />
                    <p className="text-sm font-semibold text-secondary">Tính thực tiễn</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hệ thống scale tốt với 10.000 người dùng đồng thời?
                  </p>
                </div>
                <div className="dark-card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-accent" />
                    <p className="text-sm font-semibold text-accent">Code Review</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Thiếu null-check tại analyzer.ts:12 — có thể gây crash runtime.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 relative z-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="dark-card rounded-3xl p-12 md:p-20 text-center relative overflow-hidden border-primary/30 shadow-[0_0_50px_hsl(var(--primary)/0.15)]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold uppercase tracking-wider mb-6">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Miễn phí cho sinh viên
              </div>
              <h2 className="text-3xl md:text-5xl font-serif font-black mb-5">
                Sẵn sàng toả sáng trước hội đồng?
              </h2>
              <p className="text-muted-foreground text-lg mb-10 max-w-2xl mx-auto">
                Hơn 943+ sinh viên đã chuẩn bị hoàn hảo với GraduAI.
                Đừng để những thiếu sót nhỏ làm hỏng kết quả bảo vệ của bạn.
              </p>
              <Link href={startHref}>
                <Button className="rounded-full h-14 px-10 text-lg shadow-[0_0_25px_hsl(var(--primary)/0.5)] hover:brightness-110 group">
                  Bắt đầu hoàn toàn miễn phí
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}