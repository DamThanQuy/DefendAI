import type { ScoreGroupResult, ScoreItem } from "@/lib/api";

/** Bảng điểm 1 nhóm rubric (OGA/TDA): hạng mục + trọng số đọc từ rubric DB, điểm từ mentor. */
export function ScoreGroupTable({
  items,
  result,
  scaleMax,
}: {
  items: ScoreItem[];
  result: ScoreGroupResult | null;
  scaleMax: number;
}) {
  const showAi = items.some((item) => item.ai_mark !== null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Hạng mục</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Trọng số</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Điểm mentor</th>
            {showAi && <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Điểm AI</th>}
            <th className="w-1/4 py-2 pl-3 font-medium">
              <span className="sr-only">Mức điểm</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const comments = item.reviews.filter((r) => !r.is_ai && r.comment);
            return (
              <tr key={item.code} className="border-b border-border/50 align-top last:border-0">
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-foreground">{item.label}</div>
                  {comments.map((r, i) => (
                    <p key={i} className="mt-0.5 text-xs text-muted-foreground">
                      {r.reviewer_name}: {r.comment}
                    </p>
                  ))}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{item.weight}%</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">
                  {item.mark ?? "—"}
                </td>
                {showAi && (
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {item.ai_mark ?? "—"}
                  </td>
                )}
                <td className="py-3.5 pl-3">
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    {item.mark !== null && (
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{ width: `${Math.min(100, (item.mark / scaleMax) * 100)}%` }}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border text-sm">
            <td className="py-2.5 pr-3 font-semibold text-foreground">Điểm nhóm</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs text-muted-foreground">
              {result ? `Đã chấm ${result.scored_items}/${result.total_items}` : "Chưa chấm"}
            </td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums text-foreground">
              {result?.score ?? "—"}
            </td>
            <td colSpan={showAi ? 2 : 1} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
