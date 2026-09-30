"use client";

import MaterialIcon from "@/app/material-icon";

export default function ThemeToggle() {
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.classList.add("theme-changing");
    document.documentElement.dataset.theme = next;
    localStorage.setItem("bitscan-theme", next);
    window.setTimeout(() => document.documentElement.classList.remove("theme-changing"), 360);
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Toggle color theme" title="Toggle color theme">
      <MaterialIcon name="light_mode" className="theme-icon theme-icon-sun" />
      <MaterialIcon name="dark_mode" className="theme-icon theme-icon-moon" />
    </button>
  );
}
