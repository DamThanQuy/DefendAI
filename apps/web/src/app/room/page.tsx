import { VideoCall } from "@/components/features/meeting/VideoCall";
import { Timer } from "@/components/features/meeting/Timer";
import { RoleSelector } from "@/components/features/meeting/RoleSelector";

export default function RoomPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Phòng phỏng vấn ảo</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <VideoCall />
        </div>
        <div className="flex flex-col gap-6">
          <Timer />
          <RoleSelector />
        </div>
      </div>
    </div>
  );
}
