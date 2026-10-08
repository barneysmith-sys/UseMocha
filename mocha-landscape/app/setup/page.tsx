import type { Metadata } from "next";
import { Suspense } from "react";
import { SetupScreen } from "@/components/setup/SetupScreen";

export const metadata: Metadata = {
  title: "Interview setup — Mocha",
  description: "Confirm the track, difficulty, duration, and how you want to respond.",
};

export default function SetupPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-paper" />}>
      <SetupScreen />
    </Suspense>
  );
}
