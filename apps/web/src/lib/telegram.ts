import { appConfig } from "@/lib/config";

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: {
    user?: {
      id?: number;
    };
  };
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
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

  if (process.env.NODE_ENV === "production") {
    return "";
  }

  return appConfig.devInitData;
}

export function getTelegramInitDataUserId(initData?: string): number | null {
  if (typeof window !== "undefined") {
    const tgWindow = window as TelegramWindow;
    const unsafeUserId = tgWindow.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (typeof unsafeUserId === "number" && Number.isFinite(unsafeUserId) && unsafeUserId > 0) {
      return unsafeUserId;
    }
  }

  const source = (initData ?? getTelegramInitData()).trim();
  if (!source) {
    return null;
  }

  try {
    const params = new URLSearchParams(source);
    const rawUser = params.get("user");
    if (!rawUser) {
      return null;
    }
    const parsed = JSON.parse(rawUser) as { id?: unknown };
    if (typeof parsed.id === "number" && Number.isFinite(parsed.id) && parsed.id > 0) {
      return parsed.id;
    }
    return null;
  } catch {
    return null;
  }
}

export function initTelegramViewport(): void {
  if (typeof window === "undefined") {
    return;
  }

  const tgWindow = window as TelegramWindow;
  const webApp = tgWindow.Telegram?.WebApp;
  if (!webApp) {
    return;
  }

  webApp.ready?.();
  webApp.expand?.();

  // Best-effort fullscreen for Telegram clients that support it.
  try {
    webApp.requestFullscreen?.();
  } catch {
    // Ignore unsupported clients.
  }

  // Reduce visible Telegram chrome where possible.
  try {
    webApp.setHeaderColor?.("#0b0b11");
    webApp.setBackgroundColor?.("#0b0b11");
  } catch {
    // Ignore unsupported clients.
  }

  try {
    webApp.disableVerticalSwipes?.();
  } catch {
    // Ignore unsupported clients.
  }
}
