"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from 'react-markdown';

function analyzeCodeLocal(code: string) {
  const imports: any[] = [];
  const exports: string[] = [];
  const functions: string[] = [];
  const classes: string[] = [];

  const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(code)) !== null) {
    imports.push({ module: m[3], names: m[1] ? m[1].split(",").map((s: string) => s.trim()) : [m[2]] });
  }

  const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|interface|type)\s+(\w+)/g;
  while ((m = exportRegex.exec(code)) !== null) exports.push(m[1]);

  const funcRegex = /(?:async\s+)?function\s+(\w+)/g;
  while ((m = funcRegex.exec(code)) !== null) functions.push(m[1]);

  const classRegex = /class\s+(\w+)/g;
  while ((m = classRegex.exec(code)) !== null) classes.push(m[1]);

  return { imports, exports, functions, classes };
}

export default function AnalyzePage() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [critique, setCritique] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAnalyze = async () => {
    if (!code.trim()) {
      setError("Please enter some source code to analyze.");
      return;
    }

    setIsLoading(true);
    setError("");
    setResult(null);
    setCritique(null);

    try {
      // Phân tích AST client-side bằng ts-morph-like parsing đơn giản
      // Tránh phụ thuộc vào route proxy /api/analyze
      const astData = analyzeCodeLocal(code);
      setResult(astData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCritique = async () => {
    if (!result || !code) return;

    setIsAiLoading(true);
    setError("");

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_BASE}/api/ai/critique-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_code: code,
          ast_data: result
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get AI critique");
      }

      setCritique(data.critique);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10 px-4 max-w-7xl">
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="flex flex-col h-[800px] lg:col-span-1">
          <CardHeader>
            <CardTitle>Source Code Analyzer</CardTitle>
            <CardDescription>
              Paste your TypeScript or React code here to extract its AST structure.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <Textarea
              placeholder="Paste your source code here..."
              className="flex-1 font-mono text-sm resize-none"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {error && <p className="text-sm text-critical font-medium">{error}</p>}
            <Button onClick={handleAnalyze} disabled={isLoading || isAiLoading} className="w-full">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Analyze Code
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col h-[800px] lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>AST Analysis Result</CardTitle>
              <CardDescription>
                Structured metadata extracted from the code.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto bg-muted rounded-md border m-4 mt-0 p-4">
            {result ? (
              <div className="flex flex-col h-full gap-4">
                 <pre className="text-xs font-mono flex-1 overflow-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
                <Button
                  onClick={handleCritique}
                  disabled={isAiLoading || isLoading}
                  className="w-full"
                >
                  {isAiLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Ask AI to Critique
                </Button>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Results will appear here
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col h-[800px] lg:col-span-1 border-teal-900/50 shadow-glow">
          <CardHeader className="bg-teal-950/30 rounded-t-xl border-b border-teal-900/30">
            <CardTitle className="text-teal-400 flex items-center font-mono">
              <Sparkles className="mr-2 h-5 w-5 text-teal-500" />
              AI Critique
            </CardTitle>
            <CardDescription className="text-teal-400/80">
              Insightful feedback from GPT-4o based on AST
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-6 prose prose-sm prose-invert max-w-none">
            {critique ? (
              <ReactMarkdown>{critique}</ReactMarkdown>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm opacity-50">
                <Sparkles className="h-10 w-10 mb-2 opacity-20" />
                <p>AI critique will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
