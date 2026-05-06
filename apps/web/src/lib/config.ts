export const appConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/v1",
  chatId: process.env.NEXT_PUBLIC_CHAT_ID ?? "main",
  devInitData:
    process.env.NEXT_PUBLIC_DEV_INIT_DATA ??
    "user=%7B%22id%22%3A990001%2C%22username%22%3A%22web_dev%22%2C%22first_name%22%3A%22Web%22%7D"
};

export function getApiOrigin(apiBaseUrl: string): string {
  const url = new URL(apiBaseUrl);
  return `${url.protocol}//${url.host}`;
}
