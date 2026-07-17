"use client";

import React, { useState } from "react";
import { Check, X, Clock, FileText, MoreHorizontal } from "lucide-react";

export default function BookingsPage() {
  const [requests, setRequests] = useState([
    {
      id: 1,
      studentName: "Nguyễn Văn A",
      topic: "Tối ưu hoá truy vấn SQL cho đồ án thương mại điện tử",
      date: "25/10/2024",
      time: "14:00 - 15:00",
      status: "pending",
      message: "Em đang gặp lỗi N+1 query khi hiển thị danh sách sản phẩm. Mong thầy xem qua giúp em kiến trúc Database ạ."
    },
    {
      id: 2,
      studentName: "Trần Thị B",
      topic: "Review cấu trúc Microservices (Dự án EdTech)",
      date: "26/10/2024",
      time: "16:30 - 17:30",
      status: "pending",
      message: "Thầy ơi, nhóm em đang phân vân giữa việc tách Service User và Service Auth ra riêng. Mong được thầy tư vấn."
    },
    {
      id: 3,
      studentName: "Lê Văn C",
      topic: "Kiểm tra tính khả thi của Model AI dự đoán giá nhà",
      date: "27/10/2024",
      time: "09:00 - 10:00",
      status: "pending",
      message: "Em đã train model nhưng accuracy chỉ đạt 65%. Em xin gửi trước file notebook để thầy xem giúp em có sai sót ở bước Data Preprocessing không ạ."
    }
  ]);

  const handleAction = (id: number, action: string) => {
    // Demo behavior: remove from pending list
    setRequests(requests.filter(req => req.id !== id));
  };

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Yêu cầu đặt lịch</h1>
        <p className="text-[14px] text-muted-foreground">
          Danh sách các yêu cầu (Booking) mới từ sinh viên đang chờ bạn xét duyệt.
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4 text-muted-foreground">
            <Check className="w-8 h-8" />
          </div>
          <h3 className="text-[16px] font-bold text-foreground mb-2">Không có yêu cầu mới</h3>
          <p className="text-[14px] text-muted-foreground">Bạn đã xử lý hết tất cả các yêu cầu đặt lịch.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((req) => (
            <div key={req.id} className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-6 hover:shadow-md transition-shadow">
              
              {/* Info Area */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-[14px]">
                    {req.studentName.split(" ").pop()?.[0]}
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold text-foreground">{req.studentName}</h3>
                    <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {req.time}, {req.date}</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
                  <h4 className="text-[14px] font-bold text-foreground mb-1">Chủ đề: {req.topic}</h4>
                  <p className="text-[13px] text-muted-foreground italic leading-relaxed">"{req.message}"</p>
                  
                  <div className="mt-3 flex items-center gap-2">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-[12px] font-semibold text-primary hover:bg-muted transition-colors">
                      <FileText className="w-3.5 h-3.5" /> File đính kèm (1)
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions Area */}
              <div className="flex flex-row md:flex-col items-center gap-2 md:min-w-[140px] shrink-0">
                <button 
                  onClick={() => handleAction(req.id, 'accept')}
                  className="flex-1 w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-[13px] font-bold transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" /> Chấp nhận
                </button>
                <div className="flex gap-2 w-full">
                  <button 
                    onClick={() => handleAction(req.id, 'reject')}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-card border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 rounded-lg text-[13px] font-bold transition-colors"
                  >
                    <X className="w-4 h-4" /> Từ chối
                  </button>
                  <button className="flex items-center justify-center p-2 bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-colors" title="Đổi giờ">
                    <Clock className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
