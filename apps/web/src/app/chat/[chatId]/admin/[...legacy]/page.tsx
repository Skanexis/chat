import { AdminRouteSectionSwitch } from "@/components/chat/route-sections";

export default async function AdminLegacyCatchAllPage({
  params
}: Readonly<{
  params: Promise<{ chatId: string; legacy: string[] }>;
}>) {
  const { legacy } = await params;
  const routeKey = (legacy.at(-1) ?? "").toLowerCase();
  return <AdminRouteSectionSwitch routeKey={routeKey} />;
}
