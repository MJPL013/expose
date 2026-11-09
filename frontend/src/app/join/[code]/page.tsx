import { JoinRoom } from "../../../features/join-room";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinRoom code={code.toUpperCase()} />;
}
