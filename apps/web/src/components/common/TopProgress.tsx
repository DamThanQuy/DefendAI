"use client";
import { useEffect } from "react";
import TopLoader from "nextjs-toploader";

export function TopProgress() {
  useEffect(() => {
    if (typeof window === "undefined" || (window as any).__ngrokFetchPatched) return;
    (window as any).__ngrokFetchPatched = true;
    const origFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url;
      if (urlStr.startsWith("/api") || urlStr.includes("ngrok")) {
        init = init || {};
        if (init.headers instanceof Headers) {
          if (!init.headers.has("ngrok-skip-browser-warning")) {
            init.headers.set("ngrok-skip-browser-warning", "true");
          }
        } else if (Array.isArray(init.headers)) {
          if (!init.headers.some(([k]) => k.toLowerCase() === "ngrok-skip-browser-warning")) {
            init.headers.push(["ngrok-skip-browser-warning", "true"]);
          }
        } else {
          init.headers = {
            "ngrok-skip-browser-warning": "true",
            ...(init.headers || {}),
          };
        }
      }
      return origFetch.call(this, input, init);
    };
  }, []);

  return <TopLoader
    color="#dc2626"
    height={3}
    showSpinner={false}
    speed={200}
    crawl={false}
  />;
}
