import { appConfig } from "@/lib/config";

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

export function getTelegramInitData(): string {
  if (typeof window !== "undefined") {
    const tgWindow = window as TelegramWindow;
    const webApp = tgWindow.Telegram?.WebApp;
    const initData = webApp?.initData?.trim();
    if (initData && initData.length >= 10) {
      return initData;
    }
  }

  return appConfig.devInitData;
}

export function initTelegramViewport(): void {
  if (typeof window === "undefined") {
    return;
  }

  const tgWindow = window as TelegramWindow;
  const webApp = tgWindow.Telegram?.WebApp;
  webApp?.ready?.();
  webApp?.expand?.();
}
