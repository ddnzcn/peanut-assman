import { Routes, Route, Navigate } from "react-router-dom";
import { ProjectStoreProvider } from "./model/store";
import { AppShellV2 } from "./ui/v2/AppShellV2";

export default function App() {
  return (
    <ProjectStoreProvider>
      <Routes>
        <Route path="/" element={<AppShellV2 />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProjectStoreProvider>
  );
}
