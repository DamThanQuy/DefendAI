"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function CodeReviewPage() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [scanData, setScanData] = useState<any>(null);

  useEffect(() => {
    // Đọc dữ liệu scan từ sessionStorage (do UploadZone lưu)
    const storedData = sessionStorage.getItem("codeReviewData");
    if (storedData && storedData !== "undefined" && storedData !== "null") {
      try {
        setScanData(JSON.parse(storedData));
      } catch (e) {
        console.error("Lỗi khi parse dữ liệu scan:", e);
      }
    } else {
      // Fake data
      setScanData({
        stats: { critical: 2, warnings: 5, optimizations: 8 },
        backendData: { pass_rate: 0.75 },
        details: [
          {
            severity: "critical",
            type: "SQL Injection",
            description: "Đầu vào người dùng không được kiểm tra và làm sạch trước khi đưa vào truy vấn SQL.",
            suggestion: "Sử dụng Parameterized Queries hoặc ORM (như Prisma, TypeORM) để thay thế cho việc nối chuỗi.",
            file: "apps/api/src/controllers/user.ts",
            line: 45
          },
          {
            severity: "high",
            type: "Hardcoded Secret",
            description: "Phát hiện chuỗi giống JWT Secret hoặc API Key được code cứng trong file.",
            suggestion: "Sử dụng biến môi trường (process.env) thay vì để trực tiếp trong mã nguồn.",
            file: "apps/api/src/config/auth.ts",
            line: 12
          },
          {
            severity: "medium",
            type: "Thiếu xử lý ngoại lệ (Try/Catch)",
            description: "Hàm bất đồng bộ (async) không có khối try/catch bắt lỗi.",
            suggestion: "Bọc logic trong try/catch hoặc sử dụng middleware xử lý lỗi tập trung.",
            file: "apps/api/src/services/payment.ts",
            line: 88
          },
          {
            severity: "medium",
            type: "Unused Import",
            description: "Import thư viện 'lodash' nhưng không sử dụng.",
            suggestion: "Xóa import không dùng để giảm kích thước bundle.",
            file: "apps/web/src/components/Header.tsx",
            line: 3
          },
          {
            severity: "low",
            type: "Console Log",
            description: "Phát hiện console.log() trong mã nguồn frontend.",
            suggestion: "Xóa các dòng console.log() trước khi build production.",
            file: "apps/web/src/app/page.tsx",
            line: 105
          },
          {
            severity: "low",
            type: "Thiếu Type (any)",
            description: "Biến 'data' đang sử dụng kiểu 'any'.",
            suggestion: "Định nghĩa interface/type cụ thể cho 'data' thay vì dùng 'any'.",
            file: "apps/web/src/utils/fetcher.ts",
            line: 22
          }
        ]
      });
    }
  }, []);

  if (!scanData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground font-medium">Đang tải dữ liệu báo cáo...</div>
      </div>
    );
  }

  const { stats, backendData, details } = scanData;
  const passRate = backendData?.pass_rate || 0; // vd: 0.85
  const percentage = Math.round(passRate * 100);
  
  const getScoreLabel = (score: number) => {
    if (score >= 90) return "Tốt";
    if (score >= 70) return "Khá";
    if (score >= 50) return "Trung bình";
    return "Cần cải thiện";
  };

  const scoreLabel = getScoreLabel(percentage);

  // Filter Issues
  const filteredIssues = (details || []).filter((issue: any) => {
    const sev = issue.severity?.toLowerCase();
    const isCritical = sev === 'critical' || sev === 'high';
    const isWarning = sev === 'medium';
    const isOpt = sev === 'low' || sev === 'info';

    if (activeFilter === 'critical') return isCritical;
    if (activeFilter === 'warning') return isWarning;
    if (activeFilter === 'optimization') return isOpt;
    return true; // all
  });

  return (
    <div className="min-h-screen pb-20">
      <div className="container mx-auto px-4 lg:px-8 pt-8 max-w-[1200px]">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
          <div>
            <h1 className="text-[22px] font-serif font-bold text-foreground mb-2">Code Review AI</h1>
            <p className="text-muted-foreground text-[15px]">
              Phân tích chất lượng mã nguồn và đề xuất tối ưu hóa bằng trí tuệ nhân tạo.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border text-foreground font-semibold text-[14px] rounded-lg hover:bg-muted transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Tải lên lại
            </Link>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-[14px] rounded-lg hover:brightness-110 transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Chạy phân tích mới
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {/* Card 1: Score */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6 flex flex-col items-center justify-center">
            <h3 className="text-[14px] font-semibold text-foreground mb-4">Điểm chất lượng</h3>
            <div className="relative w-24 h-24 mb-3 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-muted"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-primary"
                  strokeWidth="3.5"
                  strokeDasharray={`${percentage}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-primary leading-none">{percentage}</span>
                <span className="text-[10px] text-muted-foreground font-medium">/100</span>
              </div>
            </div>
            <p className="text-[13px] text-muted-foreground font-medium">Mức độ: {scoreLabel}</p>
          </div>

          {/* Card 2: Critical */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex relative">
            <div className="w-[4px] bg-red-500 absolute left-0 top-0 bottom-0"></div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500/10 text-red-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-[13px] font-semibold text-red-400">Cao</span>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-red-400 mb-1">
                  {stats?.critical < 10 && stats?.critical > 0 ? `0${stats.critical}` : stats?.critical || '00'}
                </h2>
                <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">LỖI NGHIÊM TRỌNG</p>
              </div>
            </div>
          </div>

          {/* Card 3: Warning */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex relative">
            <div className="w-[4px] bg-orange-500 absolute left-0 top-0 bottom-0"></div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-orange-500/10 text-orange-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <span className="text-[13px] font-semibold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md">Trung bình</span>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-orange-400 mb-1">
                  {stats?.warnings < 10 && stats?.warnings > 0 ? `0${stats.warnings}` : stats?.warnings || '00'}
                </h2>
                <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">CẢNH BÁO</p>
              </div>
            </div>
          </div>

          {/* Card 4: Optimization */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex relative">
            <div className="w-[4px] bg-green-500 absolute left-0 top-0 bottom-0"></div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500/10 text-green-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <span className="text-[13px] font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-md">Thấp</span>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-green-400 mb-1">
                  {stats?.optimizations < 10 && stats?.optimizations > 0 ? `0${stats.optimizations}` : stats?.optimizations || '00'}
                </h2>
                <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">TỐI ƯU</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <h2 className="text-[16px] font-semibold text-foreground">Chi tiết các vấn đề</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                activeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted'
              }`}
            >
              Tất cả ({details?.length || 0})
            </button>
            <button 
              onClick={() => setActiveFilter('critical')}
              className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors border border-transparent ${
                activeFilter === 'critical' ? 'bg-muted border-red-500/30 text-red-500 shadow-sm' : 'bg-transparent text-red-500 hover:bg-red-500/10'
              }`}
            >
              Lỗi ({stats?.critical || 0})
            </button>
            <button 
              onClick={() => setActiveFilter('warning')}
              className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                activeFilter === 'warning' ? 'bg-orange-500/20 text-orange-400' : 'bg-transparent text-orange-400 hover:bg-orange-500/10'
              }`}
            >
              Cảnh báo ({stats?.warnings || 0})
            </button>
          </div>
        </div>

        {/* Issue Cards List */}
        <div className="space-y-6">
          
          {filteredIssues.length === 0 ? (
            <div className="bg-card shadow-sm p-8 rounded-xl border border-border text-center text-muted-foreground">
              Không có vấn đề nào trong bộ lọc này.
            </div>
          ) : (
            filteredIssues.map((issue: any, index: number) => {
              const sev = issue.severity?.toLowerCase() || 'low';
              
              let config = {
                color: 'text-green-400',
                bg: 'bg-green-500/10',
                label: 'OPTIMIZATION',
                icon: (
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )
              };

              if (sev === 'critical' || sev === 'high') {
                config = {
                  color: 'text-red-400',
                  bg: 'bg-red-500/10',
                  label: 'CRITICAL',
                  icon: (
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )
                };
              } else if (sev === 'medium') {
                config = {
                  color: 'text-orange-400',
                  bg: 'bg-orange-500/10',
                  label: 'WARNING',
                  icon: (
                    <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )
                };
              }

              return (
                <div key={index} className="bg-card shadow-sm rounded-xl border border-border overflow-hidden">
                  <div className="p-6 pb-4">
                    <div className="flex gap-4">
                      <div className="mt-1">
                        {config.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-bold text-[15px] text-foreground">{issue.type || issue.title || 'Vấn đề mã nguồn'}</h3>
                          <span className={`px-2 py-0.5 ${config.bg} ${config.color} text-[10px] font-bold rounded uppercase tracking-wider`}>
                            {config.label}
                          </span>
                        </div>
                        <p className="text-[14px] text-muted-foreground mb-4">
                          {issue.description}
                        </p>
                        
                        {issue.suggestion && (
                          <div className="bg-primary/5 border-l-2 border-primary p-4 text-[13.5px] font-medium text-foreground italic">
                            <span className="text-primary font-bold not-italic">Gợi ý AI: </span>
                            {issue.suggestion}
                          </div>
                        )}
                        
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 border-t border-border flex justify-between items-center text-[13px]">
                    <div className="text-muted-foreground font-medium">File: {issue.file} | Line: {issue.line}</div>
                    <button className="text-primary font-semibold hover:underline">Xem tài liệu hướng dẫn</button>
                  </div>
                </div>
              );
            })
          )}

        </div>
      </div>
    </div>
  );
}
