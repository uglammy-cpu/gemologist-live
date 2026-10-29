"""Link preview image for a brand chat page: python3 og_brand.py <slug> <product.jpg> <logo.png> <stripe colour> [wordmark] [it]   (logo "-" = text wordmark only)"""
import sys, base64
from playwright.sync_api import sync_playwright
from PIL import Image
slug, prod, logo, colour = sys.argv[1:5]; word = sys.argv[5] if len(sys.argv) > 5 else ""; it = len(sys.argv) > 6 and sys.argv[6] == "it"
H1, SUB, BTN = ("Chiedi alla Gemmologa<br>- Live", "GIA Graduate Gemologist.<br>Chiedi tutto sul tuo gioiello.", "Scrivi ora") if it else ("Ask a Gemologist<br>- Live", "GIA Graduate Gemologist.<br>Ask anything about your piece.", "Chat now")
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
html = f'''<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;box-sizing:border-box}}body{{width:1200px;height:630px;display:flex;font-family:Inter,sans-serif;background:#fff;overflow:hidden}}
.l{{width:630px;height:630px;background:url(data:image/jpeg;base64,{b64(prod)}) center/cover}}
.r{{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 56px;position:relative}}
.r:before{{content:"";position:absolute;left:0;top:0;bottom:0;width:12px;background:{colour}}}
.logo{{display:flex;align-items:center;gap:16px}}.logo img{{max-height:74px;max-width:420px}}.logo b{{font-family:"Latin Modern Roman",serif;font-weight:400;font-size:40px;letter-spacing:.28em}}
.x{{margin:26px 0 10px;font-size:18px;letter-spacing:.2em;color:#8C6A2B;font-weight:600}}
h1{{font-family:"Latin Modern Roman",serif;font-weight:400;font-size:50px;line-height:1.05}}
p{{margin-top:16px;font-size:22px;color:#5B606A;line-height:1.35}}
.pill{{margin-top:26px;display:inline-flex;align-items:center;gap:10px;align-self:flex-start;background:linear-gradient(140deg,#EDD596,#CBA44F 55%,#A9833A);border:1px solid #8C6A2B;border-radius:999px;padding:12px 22px;font-size:20px;font-weight:600;color:#1C1406}}
.pill i{{width:12px;height:12px;border-radius:50%;background:#1E7A4F;border:2px solid #fff}}
</style></head><body><div class="l"></div><div class="r"><div class="logo">{"" if logo == "-" else f'<img src="data:image/png;base64,{b64(logo)}">'}{f"<b style=\"font-size:{40 if len(word) <= 10 else 27}px\">{word}</b>" if word else ""}</div>
<div class="x">× ELENA GOGLIO</div><h1>{H1}</h1><p>{SUB}</p><span class="pill"><i></i>{BTN}</span></div></body></html>'''
out = f'brands/logos/og-{slug}.jpg'
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 630}); pg.set_content(html); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/og.png'); b.close()
Image.open('/tmp/og.png').convert('RGB').save(out, quality=84); print(out)
