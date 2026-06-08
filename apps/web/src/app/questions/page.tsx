import { PersonaTab } from "@/components/features/assessment/PersonaTab";

export default function QuestionsPage() {
  return (
    <div className="container mx-auto px-4 py-8 h-[calc(100vh-4rem)] flex flex-col">
      <h1 className="text-3xl font-bold mb-6">Kết quả AI sinh câu hỏi</h1>
      <div className="flex-1 overflow-hidden">
        <PersonaTab />
      </div>
    </div>
  );
}
