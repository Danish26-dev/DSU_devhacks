/**
 * PWA install button.
 *
 * Uses the browser's `beforeinstallprompt` event to offer a native "install
 * app" action. The event only fires when the app meets install criteria
 * (served over HTTPS, has a valid manifest + service worker, not already
 * installed) — so the button hides itself when install isn't available, and
 * hides again once the app is installed or running standalone.
 *
 * For the demo: build + serve the frontend (Cloud Run over HTTPS), open it in
 * Chrome/Edge, and this button lets you install KLAIM as a desktop/mobile app.
 */
import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** The non-standard event Chromium fires when a PWA is installable. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallButton({
  variant = "outline",
  size = "sm",
  className,
  label = "Install App",
}: {
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's mini-infobar; we drive install ourselves
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Already installed / standalone → nothing to offer.
  if (installed) return null;
  // Install not available in this browser/context → don't show a dead button.
  if (!deferred) return null;

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => {
        void (async () => {
          await deferred.prompt();
          await deferred.userChoice.catch(() => undefined);
          // The event can only be used once; clear it either way.
          setDeferred(null);
        })();
      }}
    >
      <Download />
      {label}
    </Button>
  );
}
