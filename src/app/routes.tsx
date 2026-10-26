import { Route, Routes } from "react-router-dom";
import { HomePage } from "../features/flashcards/HomePage";
import { LibraryPage } from "../features/flashcards/LibraryPage";
import { ReviewPage } from "../features/flashcards/ReviewPage";
import { SettingsPage } from "../features/settings/SettingsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
