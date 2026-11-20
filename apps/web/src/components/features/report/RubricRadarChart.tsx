"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  Filler,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Radar } from "react-chartjs-2";

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

// Màu chuỗi đã chạy validate_palette (≥3:1 trên nền card sáng #ffffff / tối #10141E).
// Lưới & chữ dùng tông trung tính, không dùng màu chuỗi.
const THEME = {
  light: { series: "#0D9488", fill: "rgba(13, 148, 136, 0.12)", surface: "#ffffff", grid: "#e2e8f0", text: "#475569" },
  dark: { series: "#11A897", fill: "rgba(17, 168, 151, 0.16)", surface: "#10141E", grid: "#1e293b", text: "#cbd5e1" },
};

// Nhãn dài ("Software Requirement (SRS)") → nhiều dòng để không bị cắt ở mép canvas.
function wrapLabel(label: string, maxChars = 14): string | string[] {
  const lines: string[] = [];
  for (const word of label.split(" ")) {
    const last = lines[lines.length - 1];
    if (last && `${last} ${word}`.length <= maxChars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.length > 1 ? lines : label;
}

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** Radar 1 chuỗi (điểm mentor theo hạng mục). Bảng điểm bên cạnh là bản xem dạng bảng. */
export function RubricRadarChart({
  labels,
  values,
  scaleMax,
  seriesLabel,
}: {
  labels: string[];
  values: number[];
  scaleMax: number;
  seriesLabel: string;
}) {
  const theme = THEME[useIsDark() ? "dark" : "light"];
  return (
    <div
      className="relative h-96 w-full"
      role="img"
      aria-label={`${seriesLabel}: ${labels.map((label, i) => `${label} ${values[i]}`).join(", ")}`}
    >
      <Radar
        data={{
          labels: labels.map((label) => wrapLabel(label)),
          datasets: [
            {
              label: seriesLabel,
              data: values,
              fill: true,
              backgroundColor: theme.fill,
              borderColor: theme.series,
              borderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointHitRadius: 12,
              pointBackgroundColor: theme.series,
              pointBorderColor: theme.surface,
              pointBorderWidth: 2,
            },
          ],
        }}
        options={{
          maintainAspectRatio: false,
          scales: {
            r: {
              min: 0,
              max: scaleMax,
              ticks: { stepSize: 2, color: theme.text, backdropColor: "transparent", font: { size: 10 } },
              grid: { color: theme.grid, lineWidth: 1 },
              angleLines: { color: theme.grid, lineWidth: 1 },
              pointLabels: { color: theme.text, font: { size: 11 } },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (ctx) => ` ${ctx.formattedValue}/${scaleMax}` },
            },
          },
        }}
      />
    </div>
  );
}
