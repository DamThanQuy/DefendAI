import { Card, CardContent } from "@/components/ui/card";

export function VideoCall() {
  return (
    <Card className="w-full aspect-video bg-black text-white flex items-center justify-center overflow-hidden relative">
      <CardContent className="p-0 text-center w-full h-full">
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <p className="text-zinc-400">Jitsi Video Iframe Placeholder</p>
        </div>
        {/* Mocking local user view */}
        <div className="absolute bottom-4 right-4 w-32 h-24 bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center">
          <span className="text-xs">You</span>
        </div>
      </CardContent>
    </Card>
  );
}
