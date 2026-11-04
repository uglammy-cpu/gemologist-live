"""Oggetti in mano all'avatar di Elena (4 novembre 2026): via la pochette, lente da gioielliere in una mano,
diamante gigante tenuto fra pollice e indice nell'altra. Coordinate dell'immagine originale 1254 × 1254."""
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def remove_clutch(rgb, alpha):
    """Toglie la pochette dalla mano a sinistra (coordinate dell'immagine originale)."""
    rgb = rgb.copy(); alpha = alpha.copy()
    x0, y0, x1, y1 = 325, 818, 497, 992
    reg = rgb[y0:y1, x0:x1]; a = alpha[y0:y1, x0:x1]
    L = reg.mean(2)
    gy, gx = np.mgrid[y0:y1, x0:x1]
    sleeve = (gx > 428) & (gy < 852)          # polsino e giacca in alto a destra: restano
    dark = 1 - smooth(62, 112, L)              # 1 = pochette nera, 0 = pelle
    dark[sleeve] = 0
    # la pochette è un'area connessa: si tiene solo la componente grande
    core = (dark > 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(core, 8)
    keep = np.zeros_like(core)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 2000: keep[lab == i] = 1
    zone = cv2.dilate(keep, np.ones((5, 5), np.uint8)).astype(bool)
    k = np.where(zone, dark, 0)
    # bordo chiaro della pochette (alone) fuori dalla mano: via anche quello
    na = a * (1 - k)
    # decontaminazione dei bordi delle dita rispetto al nero della pochette
    B = np.array([30, 22, 18], np.float32)
    w = np.clip(1 - k, 0.05, 1)[..., None]
    fg = (reg - (1 - w) * B) / w
    edge = (k > 0.02) & (k < 0.98)
    reg2 = np.where(edge[..., None], np.clip(fg, 0, 255), reg)
    rgb[y0:y1, x0:x1] = reg2; alpha[y0:y1, x0:x1] = na
    return rgb, alpha

def hand_mask_left(rgb, alpha):
    """Pixel della mano a sinistra (componente chiara che contiene il centro della mano)."""
    x0, y0, x1, y1 = 325, 780, 500, 992
    L = rgb[y0:y1, x0:x1].mean(2); a = alpha[y0:y1, x0:x1]
    light = ((L > 105) & (a > 0.5)).astype(np.uint8)
    n, lab = cv2.connectedComponents(light, connectivity=8)
    seed = lab[860 - y0, 420 - x0]
    m = np.zeros(alpha.shape, np.float32)
    m[y0:y1, x0:x1] = (lab == seed).astype(np.float32)
    return m

def clean_clutch(rgb, alpha):
    """Rimuove la pochette: nella sua zona resta solo la mano."""
    rgb, alpha = remove_clutch(rgb, alpha)
    hand = hand_mask_left(rgb, alpha)
    zone = np.zeros(alpha.shape, np.uint8)
    pts = np.array([[332, 846], [372, 822], [428, 852], [497, 878], [497, 992], [326, 992], [322, 900]], np.int32)
    cv2.fillPoly(zone, [pts], 1)
    zone = zone.astype(bool)
    soft_hand = cv2.GaussianBlur(cv2.dilate(hand, np.ones((3, 3), np.uint8)), (0, 0), 0.7)
    alpha = np.where(zone, np.minimum(alpha, soft_hand), alpha)
    return rgb, alpha

# ---------------------------------------------------------------- rendering a strati (supersampling)
class Layer:
    def __init__(self, box, ss=4):
        self.x0, self.y0, self.x1, self.y1 = box; self.ss = ss
        self.w = (self.x1 - self.x0) * ss; self.h = (self.y1 - self.y0) * ss
        self.rgb = np.zeros((self.h, self.w, 3), np.float32); self.a = np.zeros((self.h, self.w), np.float32)
        gy, gx = np.mgrid[0:self.h, 0:self.w]
        self.X = self.x0 + (gx + 0.5) / ss; self.Y = self.y0 + (gy + 0.5) / ss
    def poly(self, pts):
        im = Image.new('L', (self.w, self.h), 0)
        ImageDraw.Draw(im).polygon([((x - self.x0) * self.ss, (y - self.y0) * self.ss) for x, y in pts], fill=255)
        return np.asarray(im).astype(np.float32) / 255
    def result(self):
        w, h = self.x1 - self.x0, self.y1 - self.y0
        pm = self.rgb * self.a[..., None]
        pm = cv2.resize(pm, (w, h), interpolation=cv2.INTER_AREA); a = cv2.resize(self.a, (w, h), interpolation=cv2.INTER_AREA)
        rgb = np.where(a[..., None] > 1e-4, pm / np.maximum(a[..., None], 1e-4), 0)
        return rgb, a

def composite_under(rgb, alpha, layer):
    """Mette il livello SOTTO la figura (la figura resta davanti)."""
    lr, la = layer.result(); x0, y0, x1, y1 = layer.x0, layer.y0, layer.x1, layer.y1
    fr, fa = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
    oa = fa + la * (1 - fa)
    orgb = (fr * fa[..., None] + lr * la[..., None] * (1 - fa[..., None])) / np.maximum(oa[..., None], 1e-4)
    rgb[y0:y1, x0:x1] = np.where(oa[..., None] > 1e-4, orgb, fr); alpha[y0:y1, x0:x1] = oa

def composite_over(rgb, alpha, layer, keep=None):
    """Mette il livello SOPRA la figura; 'keep' (0–1) indica i pixel della figura che restano davanti."""
    lr, la = layer.result(); x0, y0, x1, y1 = layer.x0, layer.y0, layer.x1, layer.y1
    if keep is not None: la = la * (1 - keep[y0:y1, x0:x1])
    fr, fa = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
    oa = la + fa * (1 - la)
    orgb = (lr * la[..., None] + fr * fa[..., None] * (1 - la[..., None])) / np.maximum(oa[..., None], 1e-4)
    rgb[y0:y1, x0:x1] = np.where(oa[..., None] > 1e-4, orgb, fr); alpha[y0:y1, x0:x1] = oa

def rot(px, py, cx, cy, ang):
    c, s = np.cos(ang), np.sin(ang); dx, dy = px - cx, py - cy
    return cx + c * dx - s * dy, cy + s * dx + c * dy

# ---------------------------------------------------------------- la lente da gioielliere (loupe pieghevole)
def draw_loupe():
    L = Layer((280, 830, 500, 990))
    ang = np.deg2rad(-18)
    # astuccio (dentro il pugno): rettangolo arrotondato nero satinato
    cx, cy, hw, hh, r = 412, 893, 62, 17, 9
    t = np.linspace(0, 2 * np.pi, 120)
    pts = []
    for qx, qy, a0 in [(cx + hw - r, cy - hh + r, -np.pi / 2), (cx + hw - r, cy + hh - r, 0), (cx - hw + r, cy + hh - r, np.pi / 2), (cx - hw + r, cy - hh + r, np.pi)]:
        for u in np.linspace(a0, a0 + np.pi / 2, 12):
            pts.append(rot(qx + r * np.cos(u), qy + r * np.sin(u), cx, cy, ang))
    case = L.poly(pts)
    # sfumatura: più chiaro in alto (luce dall'alto)
    lx, ly = rot(L.X, L.Y, cx, cy, -ang)
    v = np.clip((ly - (cy - hh)) / (2 * hh), 0, 1)
    col = (np.array([70, 62, 58]) * (1 - v)[..., None] + np.array([18, 15, 14]) * v[..., None])
    L.rgb = L.rgb * (1 - case[..., None]) + col * case[..., None]; L.a = np.maximum(L.a, case)
    # riflesso sul bordo superiore
    hl = case * np.exp(-((ly - (cy - hh + 4)) / 2.2) ** 2) * smooth(cx - hw + 6, cx - hw + 30, lx) * (1 - smooth(cx + hw - 30, cx + hw - 6, lx))
    L.rgb = L.rgb * (1 - 0.55 * hl[..., None]) + np.array([190, 180, 172]) * 0.55 * hl[..., None]
    # lente ruotata fuori dall'astuccio, a sinistra del pugno
    hx, hy = rot(cx - hw + 6, cy, cx, cy, ang)          # cerniera
    lcx, lcy = hx - 30, hy + 10                         # centro della lente
    R = 30
    d = np.hypot(L.X - lcx, L.Y - lcy)
    ring = smooth(R + 0.6, R - 0.6, d)                  # disco intero
    inner = smooth(R - 6.4, R - 7.6, d)                 # vetro
    rim = ring * (1 - inner)
    # cromatura: gradiente radiale/angolare
    angd = np.arctan2(L.Y - lcy, L.X - lcx)
    chrome = 0.55 + 0.45 * np.cos(angd + 2.2) ** 2 * np.sign(np.cos(angd + 2.2))
    chrome = np.clip(chrome, 0.15, 1)
    rim_col = np.array([110, 112, 118]) + (np.array([245, 246, 250]) - np.array([110, 112, 118])) * chrome[..., None]
    L.rgb = L.rgb * (1 - rim[..., None]) + rim_col * rim[..., None]; L.a = np.maximum(L.a, ring)
    # vetro: scuro con riflesso del cielo e la scena che si ingrandisce
    g = np.clip((L.Y - (lcy - R)) / (2 * R), 0, 1)
    glass = np.array([60, 72, 88]) * (1 - g)[..., None] + np.array([150, 170, 190]) * g[..., None]
    L.rgb = L.rgb * (1 - inner[..., None]) + glass * inner[..., None]
    # riflesso a mezzaluna e punto di luce
    sh = inner * smooth(R - 9, R - 14, np.hypot(L.X - (lcx - 6), L.Y - (lcy - 7))) * (1 - smooth(R - 18, R - 13, np.hypot(L.X - (lcx + 2), L.Y - (lcy + 1))))
    L.rgb = L.rgb * (1 - 0.6 * sh[..., None]) + 255 * 0.6 * sh[..., None]
    spot = inner * np.exp(-(((L.X - (lcx + 9)) / 3.2) ** 2 + ((L.Y - (lcy + 10)) / 2.4) ** 2))
    L.rgb = L.rgb * (1 - 0.8 * spot[..., None]) + 255 * 0.8 * spot[..., None]
    # perno della cerniera
    pin = smooth(4.2, 3.2, np.hypot(L.X - hx, L.Y - hy))
    L.rgb = L.rgb * (1 - pin[..., None]) + np.array([200, 200, 205]) * pin[..., None]; L.a = np.maximum(L.a, pin)
    # braccetto fra cerniera e lente
    arm = L.poly([rot(*p, hx, hy, np.arctan2(lcy - hy, lcx - hx)) for p in [(hx, hy - 4), (hx + 14, hy - 4), (hx + 14, hy + 4), (hx, hy + 4)]])
    arm = arm * (1 - ring)
    L.rgb = L.rgb * (1 - arm[..., None]) + np.array([170, 172, 178]) * arm[..., None]; L.a = np.maximum(L.a, arm)
    return L

# ---------------------------------------------------------------- il diamante gigante (taglio brillante, vista 3/4)
THUMB = [(871, 841), (879, 852), (885, 861), (890, 868), (900, 870), (909.5, 866.5), (910.5, 858), (906, 846), (901, 834), (896, 820), (893, 806), (881, 803), (872, 812), (868, 826)]

def draw_diamond(center=(832, 878), R=76, tilt=-12, elev=24, seed=7):
    rng = np.random.default_rng(seed)
    L = Layer((740, 770, 940, 1010))
    e = np.deg2rad(elev); ta = np.deg2rad(tilt)
    crownH, pav, tabR = 0.28, 0.86, 0.56
    def P(x, y, z):          # modello -> schermo (px) ; y verso chi guarda, z in alto
        sx = x; sy = -z * np.cos(e) + y * np.sin(e)
        X, Y = rot(center[0] + sx * R, center[1] + sy * R, center[0], center[1], ta)
        depth = y * np.cos(e) + z * np.sin(e)
        return X, Y, depth
    V = np.array([0, np.cos(e), np.sin(e)])
    G = [(np.cos(a), np.sin(a), 0.0) for a in np.deg2rad(np.arange(16) * 22.5)]
    G32 = [(np.cos(a), np.sin(a), 0.0) for a in np.deg2rad(np.arange(32) * 11.25)]
    T = [(tabR * np.cos(a), tabR * np.sin(a), crownH) for a in np.deg2rad(np.arange(8) * 45 + 22.5)]
    C = (0.0, 0.0, -pav)
    tris = []
    for k in range(8):
        tk, tk1 = T[k], T[(k + 1) % 8]
        g1, g2, g3 = G[(2 * k + 1) % 16], G[(2 * k + 2) % 16], G[(2 * k + 3) % 16]
        tris += [("c", tk, g1, g2), ("c", tk, g2, tk1), ("c", tk1, g2, g3)]
    for j in range(32):
        tris.append(("p", G32[j], G32[(j + 1) % 32], C))
    def env(d):
        # ambiente finto: luce dall'alto, finestre a strisce, pavimento scuro
        top = smooth(-0.35, 0.75, d[2])
        stripes = 0.5 + 0.5 * np.sin(np.arctan2(d[1], d[0]) * 5 + d[2] * 7)
        return np.clip(top * (0.3 + 0.7 * stripes), 0, 1) ** 1.25
    fire = [np.array(c, np.float32) for c in [(255, 196, 225), (190, 240, 225), (255, 240, 170), (185, 220, 255), (225, 205, 255)]]
    faces = []
    for kind, a, b, c in tris:
        A, B, Cc = map(np.array, (a, b, c))
        n = np.cross(B - A, Cc - A); n /= np.linalg.norm(n) + 1e-9
        cen = (A + B + Cc) / 3
        if np.dot(n, cen) < 0: n = -n            # normale verso l'esterno
        vis = np.dot(n, V)
        if vis <= 0.02: continue
        r = 2 * np.dot(n, V) * n - V
        lum = env(r)
        if rng.random() < 0.3: lum = 1 - lum                      # scintillio: faccette invertite
        if kind == "p": lum = 0.65 * lum + 0.08 + 0.3 * (rng.random() < 0.3)
        lum = float(np.clip(lum, 0, 1))
        pts = [P(*q) for q in (a, b, c)]
        depth = np.mean([p[2] for p in pts])
        faces.append((depth, kind, pts, lum))
    faces.sort(key=lambda f: f[0])
    dark, light = np.array([44, 56, 76], np.float32), np.array([255, 255, 255], np.float32)
    for depth, kind, pts, lum in faces:
        cov = L.poly([(p[0], p[1]) for p in pts])
        col = dark + (light - dark) * lum
        if rng.random() < 0.22:
            col = col * 0.55 + fire[rng.integers(len(fire))] * 0.45
        L.rgb = L.rgb * (1 - cov[..., None]) + col * cov[..., None]; L.a = np.maximum(L.a, cov)
    # tavola: chiara, con una banda di riflesso e le «frecce» scure dei padiglioni sotto
    tp = [P(*t)[:2] for t in T]
    tcov = L.poly(tp)
    lx, ly = rot(L.X, L.Y, center[0], center[1], -ta)
    band = np.exp(-(((lx - center[0]) - (ly - center[1]) * 1.6 + 8) / 9) ** 2)
    tcol = np.array([206, 216, 230], np.float32)[None, None] + (np.array([255, 255, 255]) - np.array([206, 216, 230]))[None, None] * band[..., None]
    L.rgb = L.rgb * (1 - tcov[..., None]) + tcol * tcov[..., None]; L.a = np.maximum(L.a, tcov)
    for k in range(0, 8, 2):                       # frecce interne
        a0 = np.deg2rad(k * 45 + 22.5)
        arrow = [P(0, 0, crownH)[:2], P(tabR * 0.92 * np.cos(a0 - 0.18), tabR * 0.92 * np.sin(a0 - 0.18), crownH)[:2], P(tabR * 0.92 * np.cos(a0 + 0.18), tabR * 0.92 * np.sin(a0 + 0.18), crownH)[:2]]
        ac = L.poly(arrow) * tcov
        L.rgb = L.rgb * (1 - 0.35 * ac[..., None]) + np.array([90, 106, 128]) * 0.35 * ac[..., None]
    # spigoli chiari e contorno
    edges = Image.new('L', (L.w, L.h), 0); dr = ImageDraw.Draw(edges)
    for depth, kind, pts, lum in faces:
        q = [((p[0] - L.x0) * L.ss, (p[1] - L.y0) * L.ss) for p in pts]
        dr.line(q + [q[0]], fill=150, width=max(1, int(0.55 * L.ss)))
    dr.polygon([((p[0] - L.x0) * L.ss, (p[1] - L.y0) * L.ss) for p in tp], outline=230, width=max(1, int(0.7 * L.ss)))
    ed = np.asarray(edges).astype(np.float32) / 255 * (L.a > 0.5)
    L.rgb = L.rgb * (1 - 0.55 * ed[..., None]) + 255 * 0.55 * ed[..., None]
    sil = (L.a > 0.5).astype(np.uint8)
    ring = (cv2.dilate(sil, np.ones((5, 5), np.uint8)) - sil).astype(np.float32)
    ring = cv2.GaussianBlur(ring, (0, 0), 1.2)
    L.rgb = np.where((L.a < 0.5)[..., None], np.array([92, 104, 120], np.float32), L.rgb)
    L.a = np.maximum(L.a, ring * 0.45)
    # scintille
    for (mx, my, mz), sz in [((-0.35, 0.1, crownH), 12), ((0.82, 0.25, 0.02), 9), ((-0.98, 0.0, 0.0), 7)]:
        sx, sy, _ = P(mx, my, mz)
        d = np.hypot(L.X - sx, L.Y - sy)
        star = np.exp(-((L.X - sx) / (sz * 0.09)) ** 2 - ((L.Y - sy) / sz) ** 2) + np.exp(-((L.Y - sy) / (sz * 0.09)) ** 2 - ((L.X - sx) / sz) ** 2)
        star = np.clip(star + np.exp(-(d / (sz * 0.25)) ** 2), 0, 1)
        L.rgb = L.rgb * (1 - star[..., None]) + 255 * star[..., None]; L.a = np.maximum(L.a, star)
    return L

def thumb_mask(shape):
    m = Image.new('L', (shape[1] * 4, shape[0] * 4), 0)
    ImageDraw.Draw(m).polygon([(x * 4, y * 4) for x, y in THUMB], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(3)).resize((shape[1], shape[0]), Image.LANCZOS)
    return np.asarray(m).astype(np.float32) / 255
