import { LandingScripts } from "./_components/LandingScripts";
import landing from "./_generated/landing.json";
import type { Metadata } from "next";
import "~~/styles/landing.css";
import "~~/styles/scenes.css";

export const metadata = landing.metadata as Metadata;

export default function Landing() {
  return (
    <>
      {/* Trusted repository HTML generated from site/index.html, never user input. */}
      <div className="landing" dangerouslySetInnerHTML={{ __html: landing.body }} />
      <LandingScripts />
    </>
  );
}
