"use client";

import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

export function RadarChart() {
  const data = {
    labels: ['Kiến thức chuyên môn', 'Giải quyết vấn đề', 'Giao tiếp', 'Kỹ năng Code', 'Phản xạ câu hỏi'],
    datasets: [
      {
        label: 'Điểm số đánh giá',
        data: [8, 7, 9, 6, 8],
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
      },
    ],
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Biểu đồ năng lực</CardTitle>
      </CardHeader>
      <CardContent>
        <Radar data={data} />
      </CardContent>
    </Card>
  );
}
