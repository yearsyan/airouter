import { EventProvider } from "./context";
import { TextModalProvider } from "./components/TextModal";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <EventProvider>
      <TextModalProvider>
        <Dashboard />
      </TextModalProvider>
    </EventProvider>
  );
}
