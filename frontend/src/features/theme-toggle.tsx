"use client";
import { Moon, Sun } from "lucide-react";
import { usePlayerPreferences, useServices } from "../session/provider";
import { Button } from "../ui/primitives";
export function ThemeToggle() {
  const { theme } = usePlayerPreferences();
  const { preferences } = useServices();
  return (
    <Button
      variant="ghost"
      aria-pressed={theme === "light"}
      onClick={() => preferences.saveTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? (
        <Sun size={18} aria-hidden="true" />
      ) : (
        <Moon size={18} aria-hidden="true" />
      )}
      {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    </Button>
  );
}
