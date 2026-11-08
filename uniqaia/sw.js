var V = "uniqaia-14df474f", START = "/?src=app";
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return k === V ? null : caches.delete(k); })); }).then(function(){ return self.clients.claim(); })); });
self.addEventListener("fetch", function(e){
  var req = e.request; if (req.method !== "GET") return;
  var url; try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;
  if (/\.(?:jpg|jpeg|png|svg|webp|woff2?)$/i.test(url.pathname)) {
    e.respondWith(caches.open(V).then(function(c){
      return c.match(req).then(function(hit){
        var net = fetch(req).then(function(res){ if (res && res.ok) c.put(req, res.clone()); return res; }).catch(function(){ return hit; });
        return hit || net;
      });
    }));
    return;
  }
  if (req.mode === "navigate" || url.pathname.endsWith("/") || /\.html?$/.test(url.pathname)) {
    e.respondWith(fetch(req).then(function(res){
      if (res && res.ok) { var cp = res.clone(); caches.open(V).then(function(c){ c.put(req, cp); }); }
      return res;
    }).catch(function(){ return caches.match(req).then(function(hit){ return hit || caches.match(START); }); }));
  }
});
