import { EventProvider } from "./context";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <EventProvider>
      <Dashboard />
    </EventProvider>
  );
}
