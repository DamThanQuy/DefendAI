"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function PDFExport() {
  const handleExport = () => {
    // Logic jsPDF will be here
    alert("Đang xuất báo cáo PDF...");
  };

  return (
    <Button onClick={handleExport} className="gap-2">
      <Download className="h-4 w-4" />
      Xuất báo cáo PDF
    </Button>
  );
}
