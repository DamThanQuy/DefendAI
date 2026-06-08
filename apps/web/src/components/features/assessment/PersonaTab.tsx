import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuestionList } from "./QuestionList";

export function PersonaTab() {
  return (
    <Tabs defaultValue="teacher" className="w-full h-full flex flex-col">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="teacher">Giáo viên hướng dẫn</TabsTrigger>
        <TabsTrigger value="reviewer">Hội đồng phản biện</TabsTrigger>
        <TabsTrigger value="student">Sinh viên khác</TabsTrigger>
      </TabsList>
      <TabsContent value="teacher" className="flex-1 mt-4">
        <QuestionList />
      </TabsContent>
      <TabsContent value="reviewer" className="flex-1 mt-4">
        <QuestionList />
      </TabsContent>
      <TabsContent value="student" className="flex-1 mt-4">
        <QuestionList />
      </TabsContent>
    </Tabs>
  );
}
