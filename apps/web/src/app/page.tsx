import { redirect } from "next/navigation";

export default function Page() {
  const defaultChatId = process.env.NEXT_PUBLIC_CHAT_ID ?? "main";
  redirect(`/chat/${encodeURIComponent(defaultChatId)}`);
}
