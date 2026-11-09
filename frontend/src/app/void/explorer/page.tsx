import type { Metadata } from "next";
import { StoryExplorer } from "../../../../gc2/explorer";
export const metadata: Metadata = {
  title: "Story explorer · Expose",
  robots: { index: false, follow: false },
};
export default function ExplorerPage() {
  return <StoryExplorer />;
}
