// Nexpreneur OS service worker: makes the app installable, shows an offline page, and receives web push.
// It never caches pages or API responses (they hold personal data); it only caches the offline page and
// immutable build assets. Bump VERSION to clear old caches.
const VERSION = "v1";
const CACHE = `nx-static-${VERSION}`;
const OFFLINE = "/offline.html";
const DEV = new URL(self.location.href).searchParams.has("dev"); // in dev, asset names aren't hashed, so don't cache them

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("nx-static-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
    return;
  }
  if (!DEV && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/icons/"))) {
    event.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Nexpreneur OS", body: event.data ? event.data.text() : "" }; }
  const title = String(data.title || "Nexpreneur OS").slice(0, 120);
  event.waitUntil(self.registration.showNotification(title, {
    body: String(data.body || "").slice(0, 300), icon: "/icons/icon-192.png", badge: "/icons/badge-96.png",
    data: { url: typeof data.url === "string" ? data.url : "/notifications" }, tag: data.tag || undefined,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL("/notifications", self.location.origin);
  try {
    const u = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : "/notifications", self.location.origin);
    if (u.origin === self.location.origin) target = u; // never navigate to another site from a push
  } catch { /* keep the default */ }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ("focus" in w) { w.navigate(target.href).catch(() => {}); return w.focus(); } }
      return self.clients.openWindow(target.href);
    }),
  );
});
