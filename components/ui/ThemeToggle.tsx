"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 1. Run only on the client after hydration completes
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("theme");

    // Check if user has a saved preference, otherwise default to system preferences
    const isDark =
      savedTheme === "dark" ||
      (!savedTheme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    setDark(isDark);
  }, []);

  // 2. Synchronize the HTML class when state changes
  useEffect(() => {
    if (!mounted) return; // Skip during initial load setup

    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark, mounted]);

  const toggleTheme = () => {
    setDark((prev) => !prev);
  };

  // 3. Render a completely identical placeholder structure during server side compilation
  if (!mounted) {
    return (
      <div
        className="w-9 h-9 p-2 rounded-lg bg-muted/40 opacity-0"
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition"
      aria-label="Toggle theme"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
