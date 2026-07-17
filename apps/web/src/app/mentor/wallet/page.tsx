"use client";

import React from "react";
import { Wallet, ArrowDownRight, ArrowUpRight, CheckCircle2, History } from "lucide-react";

export default function WalletPage() {
  const transactions = [
    { id: 1, type: "income", amount: "+500,000đ", desc: "Thanh toán cho buổi Mentor Sinh viên Nguyễn Văn A", date: "24/10/2024", status: "Thành công" },
    { id: 2, type: "income", amount: "+500,000đ", desc: "Thanh toán cho buổi Mentor Sinh viên Lê Văn C", date: "22/10/2024", status: "Thành công" },
    { id: 3, type: "withdraw", amount: "-2,000,000đ", desc: "Rút tiền về tài khoản Techcombank (*1234)", date: "15/10/2024", status: "Thành công" },
    { id: 4, type: "income", amount: "+500,000đ", desc: "Thanh toán cho buổi Mentor Sinh viên Trần Thị B", date: "10/10/2024", status: "Thành công" },
  ];

  const chartData = [
    { month: "Tháng 6", value: 30 },
    { month: "Tháng 7", value: 45 },
    { month: "Tháng 8", value: 25 },
    { month: "Tháng 9", value: 80 },
    { month: "Tháng 10", value: 65 },
  ];

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Ví & Quản lý thu nhập</h1>
          <p className="text-[14px] text-muted-foreground">
            Theo dõi tổng thu nhập, lịch sử giao dịch và gửi yêu cầu rút tiền.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Balance Card */}
        <div className="md:col-span-1 bg-gradient-to-br from-primary to-accent rounded-2xl p-6 shadow-md text-white relative overflow-hidden flex flex-col justify-between h-[220px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10 pointer-events-none"></div>
          
          <div>
            <div className="flex items-center gap-2 mb-2 font-medium opacity-90 text-[14px]">
              <Wallet className="w-4 h-4" /> Số dư khả dụng
            </div>
            <div className="text-4xl font-bold tracking-tight">12,500,000đ</div>
          </div>

          <button className="w-full mt-4 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl font-bold text-[14px] transition-colors border border-white/20">
            Yêu cầu Rút tiền
          </button>
        </div>

        {/* Chart Card */}
        <div className="md:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-sm h-[220px] flex flex-col">
          <h3 className="text-[14px] font-bold text-foreground mb-4">Thống kê thu nhập 5 tháng gần nhất</h3>
          <div className="flex-1 flex items-end gap-4 sm:gap-8 mt-auto justify-between px-2">
            {chartData.map((data, idx) => (
              <div key={idx} className="flex flex-col items-center gap-2 flex-1 group">
                <div className="w-full max-w-[40px] bg-muted/50 rounded-t-md relative flex items-end justify-center h-24 overflow-hidden group-hover:bg-muted transition-colors">
                  <div 
                    className="w-full bg-primary rounded-t-md transition-all duration-500 group-hover:bg-accent" 
                    style={{ height: `${data.value}%` }}
                  ></div>
                </div>
                <span className="text-[11px] font-bold text-muted-foreground">{data.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <h2 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2">
        <History className="w-5 h-5 text-primary" /> Lịch sử giao dịch
      </h2>
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {transactions.map((tx, idx) => (
          <div key={tx.id} className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors ${idx !== transactions.length - 1 ? 'border-b border-border' : ''}`}>
            
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0
                ${tx.type === 'income' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}
              `}>
                {tx.type === 'income' ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="text-[14px] font-bold text-foreground mb-1 line-clamp-1">{tx.desc}</h4>
                <div className="text-[12px] text-muted-foreground font-medium">{tx.date} • {tx.type === 'income' ? 'Nhận tiền' : 'Rút tiền'}</div>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0">
              <div className={`text-[15px] font-bold ${tx.type === 'income' ? 'text-green-500' : 'text-foreground'}`}>
                {tx.amount}
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mt-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" /> {tx.status}
              </div>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
