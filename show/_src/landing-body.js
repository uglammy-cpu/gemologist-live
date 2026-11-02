// Corpo della pagina pubblica di una diretta. ES5 puro: lo usa build.mjs (prerender in Node) e il browser (pagine non ancora generate).
// d = { site, prefix, lang, show, jeweler, pieces, cats, coverUrl, photoUrls, art, t, loc }
function landingBody(d) {
  var t = d.t, s = d.show, j = d.jeweler, lang = d.lang, loc = d.loc || "it-IT";
  function esc(x){ return String(x == null ? "" : x).replace(/[&<>"']/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
  function catName(slug){ for (var i = 0; i < d.cats.length; i++) if (d.cats[i].slug === slug){ var n = d.cats[i].name_i18n || {}; return n[lang] || n.en || n.it || slug; } return slug; }
  function title(){ var i = s.title_i18n || {}; return i[lang] || (lang !== "it" && i.en) || s.title; }
  function kindLabel(){ return j.kind === "gems" ? t.gems : t.shop; }
  function country(code){ try { return new Intl.DisplayNames([loc], { type:"region" }).of(code); } catch(e){ return code; } }
  function fmt(iso, o){ try { return new Intl.DateTimeFormat(loc, o).format(new Date(iso)); } catch(e){ return iso; } }
  var when = new Date(s.scheduled_at);
  var day = fmt(s.scheduled_at, { day:"numeric", timeZone:"Europe/Rome" }), mon = fmt(s.scheduled_at, { month:"short", timeZone:"Europe/Rome" });
  var full = fmt(s.scheduled_at, { weekday:"long", day:"numeric", month:"long", hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"Europe/Rome" });
  var pal = ["#3A2A17,#0F0A05","#122B45,#070D15","#2A2A30,#0A0A0D","#3A1F2C,#120810","#1C3328,#06100B","#2E2140,#0C0814","#22303A,#070B0E"];
  var h = 0; for (var i = 0; i < j.slug.length; i++) h = (h * 31 + j.slug.charCodeAt(i)) >>> 0; var p = pal[h % pal.length].split(",");
  var viewerUrl = d.site + d.prefix + "/" + j.slug + "/?s=" + s.id + "&lang=" + lang;
  var profileUrl = d.site + d.prefix + "/" + j.slug + "/profile/?lang=" + lang;
  var pageUrl = d.site + d.prefix + "/" + j.slug + "/" + s.slug + "/";
  var firstPhoto = null; for (var k = 0; k < d.pieces.length; k++) if (d.photoUrls[d.pieces[k].id]) { firstPhoto = d.photoUrls[d.pieces[k].id]; break; }
  var image = d.coverUrl || firstPhoto || "";
  var heroArt = (d.pieces[0] && d.art[d.pieces[0].art]) || d.art.ring;
  var live = s.status === "live", ended = s.status === "ended";
  var meta = [(s.lang || "").toUpperCase()].concat((s.categories || []).map(catName)); if (s.price_range) meta.push(s.price_range);
  function z(dt){ return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  var ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//uniqaia//IT","BEGIN:VEVENT","UID:" + s.id + "@uniqaia","DTSTAMP:" + z(when),"DTSTART:" + z(when),"DTEND:" + z(new Date(when.getTime() + 3600000)),"SUMMARY:" + title().replace(/,/g, "\\,") + " · " + j.name.replace(/,/g, "\\,"),"URL:" + pageUrl,"DESCRIPTION:" + pageUrl,"END:VEVENT","END:VCALENDAR"].join("\r\n");
  var icsUrl = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  var waText = encodeURIComponent(title() + " · " + j.name + "\n" + pageUrl);

  var html = '<div class="lhero" style="--c1:' + p[0] + ';--c2:' + p[1] + '">' +
    (image ? '<img class="cv" src="' + esc(image) + '" alt="">' : '<div class="art">' + heroArt + '</div>') +
    '<span class="lbl' + (live ? '' : ' off') + '" id="lStatus"><i></i>' + esc(live ? t.live : (ended ? t.ended : t.soon)) + '</span>' +
    '<h1 dir="auto">' + esc(title()) + '</h1>' +
    '<div class="lmeta"><span>' + esc(t.by) + ' ' + esc(j.name) + '</span>' + meta.filter(Boolean).map(function(m){ return '<span>· ' + esc(m) + '</span>'; }).join("") + '</div></div>';
  html += '<div class="lwhen"><div class="cal"><small>' + esc(mon) + '</small><b>' + esc(day) + '</b></div><div><time datetime="' + esc(when.toISOString()) + '">' + esc(full) + '</time><small>' + esc(t.localTime) + '</small></div></div>';
  html += '<div class="lcta">' +
    '<a class="btn dark" id="lJoin" href="' + esc(viewerUrl) + '">' + esc(live ? t.liveNow : (ended ? t.interest : t.join2)) + '</a>' +
    (ended ? '' : '<a class="btn" download="' + esc(j.slug) + '-live.ics" href="' + icsUrl + '">' + esc(t.remind) + '</a>') +
    '<a class="btn" href="https://wa.me/?text=' + waText + '" target="_blank" rel="noopener">' + esc(t.share2) + ' · WhatsApp</a></div>';
  if (ended) html += '<p class="hint" style="margin-top:10px">' + esc(t.endedLead) + '</p>';
  if (s.description) html += '<p class="eyebrow" style="margin-top:24px">' + esc(t.descH) + '</p><p class="ldesc" dir="auto">' + esc(s.description) + '</p>';
  if (d.pieces.length) html += '<p class="eyebrow" style="margin-top:24px">' + esc(t.piecesH) + '</p><div class="lpieces">' + d.pieces.map(function(pc){ var ph = d.photoUrls[pc.id]; return '<div class="lpiece"><div class="ph">' + (ph ? '<img src="' + esc(ph) + '" alt="' + esc(pc.name) + '">' : (d.art[pc.art] || d.art.none)) + '</div><b dir="auto">' + esc(pc.name) + '</b><small dir="auto">' + esc(pc.caption || "") + '</small></div>'; }).join("") + '</div>';
  html += '<a class="lseller" href="' + esc(profileUrl) + '"><span class="av">' + esc((j.name || "?").charAt(0).toUpperCase()) + '</span><span><b>' + esc(j.name) + ' <span class="chk">✓</span></b><small>' + esc([j.city, country(j.country || "IT"), kindLabel()].filter(Boolean).join(" · ")) + (j.tagline ? ' — ' + esc(j.tagline) : '') + '</small></span></a>';
  html += '<div class="howbox"><p class="eyebrow">' + esc(t.howTitle) + '</p><p>' + esc(t.howInterest) + '</p><p>' + esc(t.howBook) + '</p><p>' + esc(t.howBuy) + '</p></div>';
  html += '<p style="margin-top:22px"><a class="btn sm" href="' + d.site + d.prefix + '/?lang=' + lang + '">← ' + esc(t.backTo) + '</a></p>';
  var descText = (s.description || "").replace(/\s+/g, " ").trim();
  if (descText.length > 155) descText = descText.slice(0, 152).replace(/\s+\S*$/, "") + "…";
  return { html: html, title: title() + " · " + j.name, desc: descText || (title() + " · " + j.name + " · " + full), image: image, url: pageUrl, viewerUrl: viewerUrl, start: when.toISOString(), live: live, ended: ended };
}
if (typeof module !== "undefined") module.exports = { landingBody: landingBody };
