import type { Metadata } from "next";
import { Suspense } from "react";
import { InterviewRoom } from "@/components/interview/InterviewRoom";

export const metadata: Metadata = {
  title: "Interview — Mocha",
  description: "A prototype adaptive interview. The next question depends on the previous answer.",
};

export default function InterviewPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-paper" />}>
      <InterviewRoom />
    </Suspense>
  );
}
