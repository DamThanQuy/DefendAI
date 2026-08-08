"use client";

import React, { useState } from "react";
import { Video, Clock, FileText, CheckCircle2, XCircle } from "lucide-react";

export default function SessionsPage() {
  const [activeTab, setActiveTab] = useState("upcoming");

  const sessions = [
    {
      id: 1,
      status: "upcoming",
      studentName: "Nguyễn Văn A",
      topic: "Tối ưu hoá truy vấn SQL",
      date: "25/10/2024",
      time: "14:00 - 15:00",
      notes: "Sẽ dùng Google Meet. Sinh viên cần chuẩn bị trước sơ đồ DB."
    },
    {
      id: 2,
      status: "completed",
      studentName: "Trần Thị B",
      topic: "Review kiến trúc Microservices",
      date: "20/10/2024",
      time: "09:00 - 10:00",
      notes: "Đã tư vấn việc sử dụng API Gateway."
    },
    {
      id: 3,
      status: "canceled",
      studentName: "Lê Văn C",
      topic: "Kiểm tra Model AI",
      date: "19/10/2024",
      time: "14:00 - 15:00",
      notes: "Sinh viên báo ốm đột xuất, đã dời lịch."
    }
  ];

  const filteredSessions = sessions.filter(s => s.status === activeTab);

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Lịch sử buổi Mentor</h1>
          <p className="text-[14px] text-muted-foreground">
            Quản lý các lịch hẹn Sắp diễn ra, Đã hoàn thành hoặc Đã hủy.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        <button 
          onClick={() => setActiveTab("upcoming")}
          className={`px-6 py-3 text-[14px] font-bold border-b-2 transition-colors ${
            activeTab === "upcoming" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Sắp diễn ra
        </button>
        <button 
          onClick={() => setActiveTab("completed")}
          className={`px-6 py-3 text-[14px] font-bold border-b-2 transition-colors ${
            activeTab === "completed" ? "border-green-500 text-green-500" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Đã hoàn thành
        </button>
        <button 
          onClick={() => setActiveTab("canceled")}
          className={`px-6 py-3 text-[14px] font-bold border-b-2 transition-colors ${
            activeTab === "canceled" ? "border-red-500 text-red-500" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Đã hủy
        </button>
      </div>

      {/* List */}
      {filteredSessions.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center shadow-sm text-muted-foreground font-medium">
          Không có lịch hẹn nào trong mục này.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredSessions.map((session) => (
            <div key={session.id} className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col lg:flex-row lg:items-start justify-between gap-6 hover:shadow-md transition-shadow">
              
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white
                    ${session.status === 'upcoming' ? 'bg-primary' : session.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}
                  `}>
                    {session.studentName.split(" ").pop()?.[0]}
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold text-foreground">{session.studentName}</h3>
                    <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {session.time}, {session.date}</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4">
                  <h4 className="text-[14px] font-bold text-foreground mb-1">Chủ đề: {session.topic}</h4>
                  <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">Ghi chú: {session.notes}</p>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 border border-border rounded-md text-[12px] font-semibold text-foreground hover:bg-muted transition-colors">
                    <FileText className="w-3.5 h-3.5" /> Tài liệu đính kèm
                  </button>
                </div>
              </div>

              {/* Action */}
              <div className="flex items-center mt-4 lg:mt-0">
                {session.status === 'upcoming' && (
                  <button className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-primary hover:brightness-110 text-primary-foreground rounded-lg text-[14px] font-bold transition-all shadow-sm">
                    <Video className="w-4 h-4" /> Tham gia phòng
                  </button>
                )}
                {session.status === 'completed' && (
                  <div className="flex items-center gap-2 text-green-500 font-bold text-[14px] bg-green-500/10 px-4 py-2 rounded-lg">
                    <CheckCircle2 className="w-5 h-5" /> Đã hoàn thành
                  </div>
                )}
                {session.status === 'canceled' && (
                  <div className="flex items-center gap-2 text-red-500 font-bold text-[14px] bg-red-500/10 px-4 py-2 rounded-lg">
                    <XCircle className="w-5 h-5" /> Đã hủy
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
