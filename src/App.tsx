import { ProjectStoreProvider } from "./model/store";
import { AppShell } from "./ui/AppShell";

export default function App() {
  return (
    <ProjectStoreProvider>
      <AppShell />
    </ProjectStoreProvider>
  );
}
