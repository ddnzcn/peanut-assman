import { Routes, Route, Navigate } from "react-router-dom";
import { ProjectStoreProvider } from "./model/store";
import { AppShell } from "./ui/app-shell/AppShell";

export default function App() {
  return (
    <ProjectStoreProvider>
      <Routes>
        <Route path="/" element={<AppShell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProjectStoreProvider>
  );
}
