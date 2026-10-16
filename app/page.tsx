import { LandingPage } from "@/components/LandingPage";

const description =
  "Prepare for consulting, banking, tech, and more with Mocha. Practice realistic AI interviews, receive adaptive follow-up questions, and improve with personalized feedback.";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://usemocha.app/#organization",
      name: "Mocha",
      url: "https://usemocha.app/",
      logo: "https://usemocha.app/brand/mark.png",
    },
    {
      "@type": "WebSite",
      "@id": "https://usemocha.app/#website",
      name: "Mocha",
      url: "https://usemocha.app/",
      description,
      publisher: { "@id": "https://usemocha.app/#organization" },
    },
  ],
};

export default function Page() {
  return (
    <>
      <link rel="canonical" href="https://usemocha.app/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <LandingPage />
    </>
  );
}
