import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { ChatScreen } from "./screens/ChatScreen";
import { ModDashboard } from "./screens/ModDashboard";
import { AdminDashboard } from "./screens/AdminDashboard";
import { BookmarksScreen } from "./screens/BookmarksScreen";
import { NotificationsScreen } from "./screens/NotificationsScreen";
import { MenuScreen } from "./screens/MenuScreen";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: ChatScreen },
      { path: "mod", Component: ModDashboard },
      { path: "admin", Component: AdminDashboard },
      { path: "bookmarks", Component: BookmarksScreen },
      { path: "notifications", Component: NotificationsScreen },
      { path: "menu", Component: MenuScreen },
    ],
  },
]);
