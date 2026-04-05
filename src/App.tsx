import { Routes, Route, Navigate } from "react-router-dom";
import { ProjectStoreProvider } from "./model/store";
import { AppShell } from "./ui/AppShell";
import { AppShellV2 } from "./ui/v2/AppShellV2";

export default function App() {
  return (
    <ProjectStoreProvider>
      <Routes>
        <Route path="/" element={<AppShell />} />
        <Route path="/v2" element={<AppShellV2 />} />
        <Route path="*" element={<Navigate to="/v2" replace />} />
      </Routes>
    </ProjectStoreProvider>
  );
}
