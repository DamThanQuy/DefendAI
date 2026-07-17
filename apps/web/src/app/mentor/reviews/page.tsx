"use client";

import React from "react";
import { Star, MessageSquare } from "lucide-react";

export default function ReviewsPage() {
  const reviews = [
    {
      id: 1,
      studentName: "Nguyễn Văn A",
      rating: 5,
      date: "24/10/2024",
      content: "Thầy hướng dẫn rất tận tình, nhờ thầy mà em đã tối ưu được câu truy vấn giảm thời gian load từ 2s xuống còn 200ms. Cảm ơn thầy rất nhiều!"
    },
    {
      id: 2,
      studentName: "Trần Thị B",
      rating: 4,
      date: "20/10/2024",
      content: "Buổi mentor rất bổ ích. Tuy nhiên em hy vọng lần tới có thể kéo dài thời gian thêm 15 phút vì nhóm em có khá nhiều câu hỏi."
    },
    {
      id: 3,
      studentName: "Lê Văn C",
      rating: 5,
      date: "15/10/2024",
      content: "Kiến thức của mentor siêu vững, chỉ điểm ra ngay lỗi hổng kiến trúc mà nhóm em đang mắc phải."
    }
  ];

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Đánh giá & Phản hồi</h1>
        <p className="text-[14px] text-muted-foreground">
          Đọc nhận xét từ sinh viên để hiểu mức độ hài lòng và liên tục cải thiện chất lượng dịch vụ của bạn.
        </p>
      </div>

      {/* Stats Header */}
      <div className="bg-card border border-border rounded-xl p-8 shadow-sm flex flex-col md:flex-row items-center gap-8 mb-8">
        <div className="text-center md:text-left flex flex-col items-center md:items-start md:border-r border-border md:pr-8">
          <div className="text-5xl font-black text-foreground mb-2">4.9</div>
          <div className="flex items-center gap-1 mb-1 text-yellow-500">
            <Star className="w-5 h-5 fill-current" />
            <Star className="w-5 h-5 fill-current" />
            <Star className="w-5 h-5 fill-current" />
            <Star className="w-5 h-5 fill-current" />
            <Star className="w-5 h-5 fill-current" />
          </div>
          <div className="text-[13px] text-muted-foreground font-medium">Trung bình (35 đánh giá)</div>
        </div>

        <div className="flex-1 w-full space-y-2">
          {/* Progress bars for stars */}
          {[5, 4, 3, 2, 1].map((star) => (
            <div key={star} className="flex items-center gap-3 text-[12px] font-bold text-muted-foreground">
              <span className="w-8 text-right">{star} sao</span>
              <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-yellow-500 rounded-full" 
                  style={{ width: star === 5 ? '90%' : star === 4 ? '10%' : '0%' }}
                ></div>
              </div>
              <span className="w-8">{star === 5 ? 31 : star === 4 ? 4 : 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reviews List */}
      <h2 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" /> Nhận xét mới nhất
      </h2>
      <div className="space-y-4">
        {reviews.map((review) => (
          <div key={review.id} className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-[14px]">
                  {review.studentName.split(" ").pop()?.[0]}
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-foreground">{review.studentName}</h3>
                  <div className="text-[12px] text-muted-foreground font-medium">{review.date}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-yellow-500">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < review.rating ? "fill-current" : "text-muted-foreground opacity-30"}`} />
                ))}
              </div>
            </div>
            <p className="text-[14px] text-foreground leading-relaxed italic">
              "{review.content}"
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
