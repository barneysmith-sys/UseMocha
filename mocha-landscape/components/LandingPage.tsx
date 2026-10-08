"use client";

import { MotionConfig } from "framer-motion";
import { HeroSection } from "@/components/hero/HeroSection";
import { ChooseInterview } from "@/components/search/ChooseInterview";
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
      <SiteNav onStart={() => draft.focusSearch()} />
      <main>
        <HeroSection />
        <ChooseInterview />
        <LandingPageSections />
      </main>
    </>
  );
}
