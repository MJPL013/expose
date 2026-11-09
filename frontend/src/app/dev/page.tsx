import { notFound } from "next/navigation";
import { DeveloperHome } from "../../features/developer/home";

export default function DeveloperPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DeveloperHome />;
}
