import { notFound } from "next/navigation";
import { DeveloperGame } from "../../features/developer/workbench";
export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DeveloperGame />;
}
