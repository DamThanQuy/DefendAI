"use client";
import TopLoader from "nextjs-toploader";

export function TopProgress() {
  return <TopLoader
    color="#dc2626"
    height={3}
    showSpinner={false}
    speed={200}
    crawl={false}
  />;
}
