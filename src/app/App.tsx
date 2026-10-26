import { BrowserRouter } from "react-router-dom";
import { BottomNav } from "../components/BottomNav";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 pb-24 pt-6">
        <AppRoutes />
      </div>
      <BottomNav />
    </BrowserRouter>
  );
}
