import type { Metadata } from "next";
import { VoidExperience } from "../../../gc2/experience";
export const metadata: Metadata = {
  title: "The Void · Expose",
  robots: { index: false, follow: false },
};
export default function VoidPage() {
  return <VoidExperience />;
}
