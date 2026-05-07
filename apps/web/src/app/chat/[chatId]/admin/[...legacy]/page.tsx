import { redirect } from "next/navigation";

export default async function AdminLegacyCatchAllPage({
  params
}: Readonly<{
  params: Promise<{ chatId: string; legacy: string[] }>;
}>) {
  const { chatId } = await params;
  redirect(`/chat/${encodeURIComponent(chatId)}/admin`);
}
