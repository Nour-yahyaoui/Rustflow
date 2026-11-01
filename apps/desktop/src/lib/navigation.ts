import {
  BookOpen,
  Braces,
  Cloud as CloudIcon,
  History as HistoryIcon,
  Layers,
  Play,
  Radio,
  Settings as SettingsIcon,
} from "lucide-react";
export const routes = [
  { id: "workspace", label: "Workspace", icon: Layers },
  { id: "history", label: "History", icon: HistoryIcon },
  { id: "environments", label: "Environments", icon: Braces },
  { id: "websocket", label: "WebSocket", icon: Radio },
  { id: "docs", label: "API documentation", icon: BookOpen },
  { id: "runner", label: "Test runner", icon: Play },
  { id: "cloud", label: "Cloud workspaces", icon: CloudIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];
