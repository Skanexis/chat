import { redirect } from "next/navigation";

export default async function AdminIndexPage({
  params
}: Readonly<{
  params: Promise<{ chatId: string }>;
}>) {
  const { chatId } = await params;
  redirect(`/chat/${encodeURIComponent(chatId)}/admin/roles`);
}
