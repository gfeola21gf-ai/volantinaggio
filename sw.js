/* sw.js — il SERVICE WORKER: un aiutante che vive nel telefono anche ad app chiusa.
   1. Tiene una COPIA dei file dell'app ("prima la rete": con internet scarica la versione nuova,
      senza internet usa la copia, così l'app si apre anche in strada).
   2. Riceve i PROMEMORIA (notifiche push) da Supabase e li mostra; toccandoli apre il contatto.
   GitHub Pages dice «tieni i file 10 minuti» (max-age=600): per i NOSTRI file chiedo sempre al server se sono
   cambiati (cache: "no-cache" = domanda veloce con l'ETag), così una nuova pubblicazione arriva subito.
   Versione 2026-10-31b (cambiare questa riga fa aggiornare l'aiutante sui telefoni). */
const COPIA = "volantini-file";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  if (new URL(r.url).hostname.endsWith("supabase.co")) return;   // i dati li gestisce dati.js
  e.respondWith(
    fetch(r, new URL(r.url).origin === location.origin ? { cache: "no-cache" } : {})
      .then(risposta => {
        if (risposta.ok || risposta.type === "opaque") {
          const copia = risposta.clone();
          caches.open(COPIA).then(c => c.put(r, copia));
        }
        return risposta;
      })
      .catch(() => caches.match(r, { ignoreSearch: true }))
  );
});

self.addEventListener("push", e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.titolo || "Volantinaggio", {
    body: d.testo || "",
    icon: "icona-192.png",
    tag: d.tag || "promemoria",
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const f of finestre) {
      if ("navigate" in f) { await f.focus(); return f.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
