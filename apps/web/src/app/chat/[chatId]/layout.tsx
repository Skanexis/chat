import { ChatAppShell } from "@/components/chat/chat-app-shell";
import { ChatRuntimeProvider } from "@/components/chat/runtime-context";

export default async function ChatLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ chatId: string }>;
}>) {
  const { chatId } = await params;

  return (
    <main className="page-root">
      <ChatRuntimeProvider chatId={chatId}>
        <ChatAppShell>{children}</ChatAppShell>
      </ChatRuntimeProvider>
    </main>
  );
}
