"use client";

import React, { useState } from "react";

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      <div
        className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-300 ease-in-out cursor-pointer flex flex-col items-center justify-center min-h-[350px] ${
          isDragging
            ? "border-blue-500 bg-blue-50 shadow-2xl scale-[1.02]"
            : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 dark:border-gray-700 dark:hover:bg-gray-800/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-upload")?.click()}
      >
        <div className={`p-5 rounded-full mb-6 transition-all duration-500 ${isDragging ? "bg-blue-100 scale-110" : "bg-blue-50 dark:bg-blue-900/30"}`}>
          <svg
            className={`w-14 h-14 transition-colors duration-300 ${isDragging ? "text-blue-600" : "text-blue-500"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        
        {file ? (
          <div className="space-y-3 animate-in fade-in zoom-in duration-500">
            <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-400">{file.name}</h3>
            <div className="inline-block px-4 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
            <p className="text-sm font-medium mt-6 text-gray-500 hover:text-blue-600 transition-colors">
              Nhấn để chọn một tệp khác
            </p>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            <h3 className="text-3xl font-extrabold mb-4 text-gray-800 dark:text-gray-100 tracking-tight">Tải tài liệu lên</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto leading-relaxed text-lg">
              Kéo và thả file đồ án của bạn vào đây hoặc nhấn để chọn tệp. Hỗ trợ định dạng <span className="font-semibold">PDF, DOCX, ZIP</span>.
            </p>
            <div className="inline-block px-8 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl shadow-sm hover:bg-gray-50 hover:shadow-md transition-all duration-200">
              Duyệt tệp từ máy
            </div>
          </div>
        )}
        
        <input
          id="file-upload"
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept=".pdf,.docx,.zip,.rar"
        />
      </div>

      {file && (
        <div className="mt-10 flex justify-center animate-in slide-in-from-bottom-6 fade-in duration-700">
          <button className="px-12 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-lg rounded-2xl shadow-xl hover:shadow-2xl hover:shadow-blue-500/40 transform hover:-translate-y-1 transition-all duration-300 flex items-center space-x-3">
            <span>Bắt đầu phân tích AI</span>
            <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
