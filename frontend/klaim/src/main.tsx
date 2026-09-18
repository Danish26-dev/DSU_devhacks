import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker policy.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    // Production: enable the PWA app-shell service worker.
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  } else {
    // Development: never let a service worker intercept routing. Actively remove
    // any previously-installed SW and purge its caches so stale cached routes
    // (e.g. an old "/" redirect) can never be served during development.
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => void r.unregister());
    });
    if (typeof caches !== "undefined") {
      void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
    }
  }
}
