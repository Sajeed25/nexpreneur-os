"use client";
import * as React from "react";

/** Registers the service worker (install prompt, offline page, web push). Does nothing where service workers aren't supported. */
export function PwaRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const dev = process.env.NODE_ENV !== "production";
    navigator.serviceWorker.register(dev ? "/sw.js?dev=1" : "/sw.js", { scope: "/" }).catch((e) => console.warn("service worker failed", e));
  }, []);
  return null;
}
