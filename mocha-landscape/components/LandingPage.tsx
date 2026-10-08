"use client";

import { MotionConfig } from "framer-motion";
import { HeroSection } from "@/components/hero/HeroSection";
import { InterviewDraftProvider, useInterviewDraft } from "@/components/search/InterviewDraft";
import { LandingPageSections } from "@/components/sections/LandingPageSections";
import { SiteNav } from "@/components/SiteNav";

export function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <InterviewDraftProvider>
        <Page />
      </InterviewDraftProvider>
    </MotionConfig>
  );
}

function Page() {
  const draft = useInterviewDraft();
  return (
    <>
      <a href="#practice" className="skip-link">
        Skip to interview search
      </a>
      <SiteNav
        onStart={() => {
          document.getElementById("practice")?.scrollIntoView({ behavior: "smooth", block: "center" });
          draft.open();
          window.setTimeout(() => document.querySelector<HTMLInputElement>("#practice input")?.focus(), 60);
        }}
      />
      <main>
        <HeroSection />
        <LandingPageSections />
      </main>
    </>
  );
}
