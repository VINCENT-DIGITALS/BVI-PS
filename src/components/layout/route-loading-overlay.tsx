"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Global route-transition loading modal. Watches for clicks on internal links;
 * if the destination is a different page, it shows a dimmed modal with a
 * progress indicator after a short grace period (so instant/cached navigations
 * don't flash), then hides once the new route has rendered (pathname changes).
 */
export function RouteLoadingOverlay() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    showTimer.current = null;
    safetyTimer.current = null;
  };

  // Navigation finished (the path changed) → hide. The setState here is
  // intentional and cheap: it's a no-op unless the overlay is currently
  // showing, so it cannot cause cascading renders.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(false);
    clearTimers();
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      const target = anchor.getAttribute("target");
      if (!href || href.startsWith("#") || target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      // Only internal navigations to a *different* page.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      clearTimers();
      // Grace period: don't flash the modal on near-instant navigations.
      showTimer.current = setTimeout(() => setLoading(true), 120);
      // Backstop so the overlay can never get stuck.
      safetyTimer.current = setTimeout(() => setLoading(false), 6000);
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearTimers();
    };
  }, []);

  if (!loading) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/60 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-10 py-8 shadow-xl">
        {/* Progress circle */}
        <span className="relative flex size-12 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary" />
        </span>

        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Loading…</p>
          <p className="text-xs text-muted-foreground">Please wait</p>
        </div>

        {/* Indeterminate progress bar (hybrid indicator) */}
        <div className="h-1.5 w-44 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 rounded-full bg-primary animate-[route-loading-bar_1.1s_ease-in-out_infinite]" />
        </div>
      </div>
      <span className="sr-only">Loading the next page</span>
    </div>
  );
}
