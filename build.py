"""Builds the stand-alone chat pages (brands/*.json with a "page") from the chat frame w/index.html."""
import json, os, glob, html
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://live.gemsandjewelrytechlab.com"
frame = open(os.path.join(HERE, "w", "index.html"), encoding="utf-8").read()
for path in sorted(glob.glob(os.path.join(HERE, "brands", "*.json"))):
    b = json.load(open(path, encoding="utf-8"))
    page = (b.get("page") or "").strip("/")
    if not page:
        continue
    title = b.get("title") or ("Ask a Gemologist - Live" if b.get("lang") != "it" else "Chiedi alla Gemmologa - Live")
    if b.get("name"):
        title += " · " + b["name"]
    desc = b.get("description", "")
    og = BASE + (b.get("og") or ("/it/og.png" if b.get("lang") == "it" else "/og.png"))
    url = BASE + "/" + page + "/"
    meta = "\n".join([
        f'<meta name="description" content="{html.escape(desc)}">',
        f'<link rel="canonical" href="{url}">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:title" content="{html.escape(title)}">',
        f'<meta property="og:description" content="{html.escape(desc)}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{og}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta name="twitter:card" content="summary_large_image">',
    ])
    out = frame.replace("<!--META-->", meta)
    out = out.replace('<html lang="en">', f'<html lang="{"it" if b.get("lang") == "it" else "en"}">', 1)
    out = out.replace("<title>Ask a Gemologist - Live · Elena Goglio</title>", f"<title>{html.escape(title)} · Elena Goglio</title>", 1)
    out = out.replace("var BAKED = null;", "var BAKED = " + json.dumps(b, ensure_ascii=False) + ";", 1)
    dst = os.path.join(HERE, page, "index.html")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, "w", encoding="utf-8").write(out)
    print("built", "/" + page + "/", "from", os.path.basename(path))
