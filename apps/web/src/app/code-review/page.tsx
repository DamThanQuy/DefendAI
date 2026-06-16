"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function CodeReviewPage() {
  const [activeFilter, setActiveFilter] = useState("all");

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-20">
      <div className="container mx-auto px-4 lg:px-8 pt-8 max-w-[1200px]">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 mb-2">Code Review AI</h1>
            <p className="text-[#5f6368] text-[15px]">
              Phân tích chất lượng mã nguồn và đề xuất tối ưu hóa bằng trí tuệ nhân tạo.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold text-[14px] rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Tải lên lại
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-[#0f2e82] text-white font-semibold text-[14px] rounded-lg hover:bg-[#0f2e82]/90 transition-colors shadow-sm">
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
          <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-6 flex flex-col items-center justify-center">
            <h3 className="text-[14px] font-semibold text-gray-700 mb-4">Điểm chất lượng</h3>
            <div className="relative w-24 h-24 mb-3 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-gray-100"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#0f2e82]"
                  strokeWidth="3.5"
                  strokeDasharray="75, 100"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-[#0f2e82] leading-none">75</span>
                <span className="text-[10px] text-gray-500 font-medium">/100</span>
              </div>
            </div>
            <p className="text-[13px] text-gray-600 font-medium">Mức độ: Khá</p>
          </div>

          {/* Card 2: Critical */}
          <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden flex relative">
            <div className="w-[4px] bg-[#d32f2f] absolute left-0 top-0 bottom-0"></div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50 text-[#d32f2f]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-[13px] font-semibold text-[#d32f2f]">Cao</span>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-[#d32f2f] mb-1">03</h2>
                <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide">LỖI NGHIÊM TRỌNG</p>
              </div>
            </div>
          </div>

          {/* Card 3: Warning */}
          <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden flex relative">
            <div className="w-[4px] bg-[#f57c00] absolute left-0 top-0 bottom-0"></div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-orange-50 text-[#f57c00]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <span className="text-[13px] font-semibold text-[#f57c00] bg-orange-50 px-2 py-0.5 rounded-md">Trung bình</span>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-[#f57c00] mb-1">08</h2>
                <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide">CẢNH BÁO</p>
              </div>
            </div>
          </div>

          {/* Card 4: Optimization */}
          <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden flex relative">
            <div className="w-[4px] bg-[#388e3c] absolute left-0 top-0 bottom-0"></div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-50 text-[#388e3c]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <span className="text-[13px] font-semibold text-[#388e3c] bg-green-50 px-2 py-0.5 rounded-md">Thấp</span>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-[#388e3c] mb-1">12</h2>
                <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide">TỐI ƯU</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <h2 className="text-[16px] font-semibold text-gray-800">Chi tiết các vấn đề</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                activeFilter === 'all' ? 'bg-[#e0e0e0] text-gray-800' : 'bg-transparent text-gray-600 hover:bg-gray-100'
              }`}
            >
              Tất cả (23)
            </button>
            <button 
              onClick={() => setActiveFilter('critical')}
              className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors border border-transparent ${
                activeFilter === 'critical' ? 'bg-white border-[#d32f2f]/30 text-[#d32f2f] shadow-sm' : 'bg-transparent text-[#d32f2f] hover:bg-red-50'
              }`}
            >
              Lỗi (3)
            </button>
            <button 
              onClick={() => setActiveFilter('warning')}
              className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                activeFilter === 'warning' ? 'bg-[#fff3e0] text-[#f57c00]' : 'bg-transparent text-[#f57c00] hover:bg-orange-50'
              }`}
            >
              Cảnh báo (8)
            </button>
          </div>
        </div>

        {/* Issue Cards List */}
        <div className="space-y-6">
          
          {/* Issue 1: Critical */}
          {(activeFilter === 'all' || activeFilter === 'critical') && (
            <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
              <div className="p-6 pb-4">
                <div className="flex gap-4">
                  <div className="mt-1">
                    <svg className="w-5 h-5 text-[#d32f2f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-[15px] text-gray-900">Lỗ hổng SQL Injection</h3>
                      <span className="px-2 py-0.5 bg-red-50 text-[#d32f2f] text-[10px] font-bold rounded uppercase tracking-wider">Critical</span>
                    </div>
                    <p className="text-[14px] text-gray-600">
                      Sử dụng chuỗi cộng trực tiếp vào câu truy vấn SQL gây nguy cơ tấn công injection. Hãy sử dụng Prepared Statements.
                    </p>
                  </div>
                </div>
              </div>

              {/* Code Diff Block */}
              <div className="bg-[#fafafa] border-y border-gray-100 font-mono text-[13px] w-full overflow-x-auto">
                <div className="flex bg-[#ffebee] text-[#c62828] py-1 px-4">
                  <div className="w-8 opacity-50 select-none">12</div>
                  <div className="w-4 select-none">-</div>
                  <div className="whitespace-pre">String query = "SELECT * FROM users WHERE id = '" + userId + "'";</div>
                </div>
                <div className="flex bg-[#e8f5e9] text-[#2e7d32] py-1 px-4">
                  <div className="w-8 opacity-50 select-none">12</div>
                  <div className="w-4 select-none">+</div>
                  <div className="whitespace-pre">PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");</div>
                </div>
                <div className="flex bg-[#e8f5e9] text-[#2e7d32] py-1 px-4">
                  <div className="w-8 opacity-50 select-none">13</div>
                  <div className="w-4 select-none">+</div>
                  <div className="whitespace-pre">ps.setString(1, userId);</div>
                </div>
              </div>

              <div className="p-4 bg-white flex justify-between items-center text-[13px]">
                <div className="text-gray-500 font-medium">File: UserController.java | Line: 12</div>
                <button className="text-[#0f2e82] font-semibold hover:underline">Xem tài liệu hướng dẫn</button>
              </div>
            </div>
          )}

          {/* Issue 2: Warning */}
          {(activeFilter === 'all' || activeFilter === 'warning') && (
            <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
              <div className="p-6 pb-4">
                <div className="flex gap-4">
                  <div className="mt-1">
                    <div className="w-7 h-7 bg-orange-100 rounded flex items-center justify-center text-[#f57c00]">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-[15px] text-gray-900">Vòng lặp không hiệu quả</h3>
                      <span className="px-2 py-0.5 bg-orange-50 text-[#f57c00] text-[10px] font-bold rounded uppercase tracking-wider">Warning</span>
                    </div>
                    <p className="text-[14px] text-gray-600">
                      Sử dụng nested loops (O(n^2)) trên mảng dữ liệu lớn. Cân nhắc sử dụng HashMap để tối ưu thời gian tìm kiếm thành O(n).
                    </p>
                  </div>
                </div>
              </div>

              {/* Code Diff Block */}
              <div className="bg-[#fafafa] border-y border-gray-100 font-mono text-[13px] w-full overflow-x-auto">
                <div className="flex bg-[#ffebee] text-[#c62828] py-1 px-4">
                  <div className="w-8 opacity-50 select-none">45</div>
                  <div className="w-4 select-none">-</div>
                  <div className="whitespace-pre">for(User user : allUsers) {"{ for(Role role : allRoles) { ... } }"}</div>
                </div>
                <div className="flex bg-[#e8f5e9] text-[#2e7d32] py-1 px-4">
                  <div className="w-8 opacity-50 select-none">45</div>
                  <div className="w-4 select-none">+</div>
                  <div className="whitespace-pre">Map roleMap = allRoles.stream().collect(Collectors.toMap(Role::getId, r {'>'} r));</div>
                </div>
              </div>

              <div className="p-4 bg-white flex justify-between items-center text-[13px]">
                <div className="text-gray-500 font-medium">File: RoleService.java | Line: 45</div>
                <button className="text-[#0f2e82] font-semibold hover:underline">Áp dụng gợi ý AI</button>
              </div>
            </div>
          )}

          {/* Issue 3: Optimization */}
          {(activeFilter === 'all') && (
            <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
              <div className="p-6 pb-4">
                <div className="flex gap-4">
                  <div className="mt-1">
                    <div className="w-7 h-7 bg-green-100 rounded flex items-center justify-center text-[#388e3c]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-[15px] text-gray-900">Chuẩn hóa tên biến</h3>
                      <span className="px-2 py-0.5 bg-green-50 text-[#388e3c] text-[10px] font-bold rounded uppercase tracking-wider">Optimization</span>
                    </div>
                    <p className="text-[14px] text-gray-600">
                      Tên biến không tuân thủ camelCase trong Java. Đổi 'user_full_name' thành 'userFullName'.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[#fafafa] border-t border-gray-100 flex justify-between items-center text-[13px]">
                <div className="text-gray-500 font-medium">File: UserProfile.java | Line: 8</div>
                <button className="text-[#0f2e82] font-semibold hover:underline">Đổi tên tự động</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
