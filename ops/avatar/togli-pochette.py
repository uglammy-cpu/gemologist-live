"""Elena a mani libere: la prima illustrazione (elena-volto.png) senza la pochette nella mano destra.

Uso:  python3 ops/avatar/togli-pochette.py        → ops/avatar/elena-mani-libere.png
Serve: numpy, opencv-python, pillow.

Scelta di Elena del 6 novembre 2026: la seconda versione dell'avatar ha tutte e due le mani libere (niente diamante,
niente lente). Si parte dalla prima illustrazione, che ha già il volto che lei preferisce e la mano sinistra libera:
qui si toglie solo la pochette.

È un ritocco classico, senza IA generativa (regola della scheda dell'avatar: niente nuove immagini di lei generate):
  1. la pochette (pixel scuri attaccati al suo corpo, con il filo chiaro dei bordi) diventa sfondo: il modello
     dello sfondo dell'illustrazione più il residuo misurato sullo sfondo vero intorno, con la stessa grana;
  2. il bordo delle dita che toccava la pochette perde l'alone scuro e torna morbido sullo sfondo;
  3. l'angolo del palmo, che la pochette copriva, si chiude con una curva morbida (il pollice resta nascosto dietro
     la mano), con il colore della pelle prolungato dalla mano e l'ombra arancio dei bordi del disegno.
Il resto dell'immagine resta identico, pixel per pixel.
"""
import os
import numpy as np, cv2
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'elena-volto.png')
OUT = os.path.join(HERE, 'elena-mani-libere.png')

img = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W = img.shape[:2]
ell = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
yy, xx = np.mgrid[0:H, 0:W]
rng = np.random.default_rng(7)


# ---------------------------------------------------------------- sfondo
def background(im):
    """Polinomio di 3° grado sui pixel di sfondo (simili all'angolo in alto a sinistra), raffinato quattro volte."""
    fx, fy = xx / W, yy / H
    F = np.stack([np.ones_like(fx), fx, fy, fx * fx, fy * fy, fx * fy, fx ** 3, fy ** 3, fx * fx * fy, fx * fy * fy], -1)
    BG = None
    for _ in range(4):
        if BG is None:
            ref = im[5:40, 5:40].reshape(-1, 3).mean(0)
            sel = np.sqrt(((im - ref) ** 2).sum(2)) < 40
        else:
            sel = np.sqrt(((im - BG) ** 2).sum(2)) < 6
        s = sel[::3, ::3]
        A = F[::3, ::3][s]
        BG = np.zeros_like(im)
        for c in range(3):
            coef, *_ = np.linalg.lstsq(A, im[::3, ::3, c][s], rcond=None)
            BG[..., c] = F @ coef
    return BG


def local(im, mask, BG, ring=30):
    """Sfondo locale: il modello più il residuo dello sfondo vero intorno alla zona da rifare."""
    d = np.sqrt(((im - BG) ** 2).sum(2))
    around = (cv2.dilate(mask.astype(np.uint8), ell(ring)) > 0) & (mask == 0) & (d < 10)
    res = (im - BG) * around[..., None]
    num = np.zeros_like(im); den = np.zeros((H, W), np.float32)
    for s in (8, 16, 32):
        num += cv2.GaussianBlur(res, (0, 0), s); den += cv2.GaussianBlur(around.astype(np.float32), (0, 0), s)
    return BG + num / np.maximum(den[..., None], 1e-3)


BG = background(img)
hsv = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
S, V = hsv[..., 1], hsv[..., 2]
dist = np.sqrt(((img - BG) ** 2).sum(2))

# ---------------------------------------------------------------- 1. la pochette
box = np.zeros((H, W), np.uint8); box[820:990, 330:505] = 1
n, lab = cv2.connectedComponents(((V < 110) & (box > 0)).astype(np.uint8), 8)
bag = (lab == lab[930, 450]).astype(np.uint8)            # un punto nel corpo della pochette
skin = (S > 105) & (V > 120)
rim = (cv2.dilate(bag, ell(4)) > 0) & (bag == 0) & ~skin & (dist > 5)   # filo chiaro dei bordi
bag = cv2.morphologyEx(((bag > 0) | rim).astype(np.uint8), cv2.MORPH_CLOSE, ell(2))
bag[:815] = 0; bag[:, 510:] = 0
BGL = local(img, bag, BG)
out = img.copy()
out[bag > 0] = (BGL + rng.normal(0, 0.9, img.shape))[bag > 0]

# ---------------------------------------------------------------- 2–3. la mano: bordo pulito e angolo del palmo chiuso
win = np.zeros((H, W), bool); win[815:960, 340:500] = True
lum0 = img.mean(2)
# pelle piena dell'originale, compreso il bordo arancio scuro che il disegno mette su tutte le dita
solid = win & ((img[..., 0] - img[..., 2]) > 120) & (lum0 > 112) & (bag == 0)
zone = win & (cv2.dilate(bag, ell(4)) > 0)                # dove pelle e pochette potevano mescolarsi

# colore della pelle lì vicino (convoluzione normalizzata sui pixel di pelle piena)
def spread(mask, sig):
    m = mask.astype(np.float32); num = np.zeros_like(img); den = np.zeros((H, W), np.float32)
    for s_ in sig:
        num += cv2.GaussianBlur(img * m[..., None], (0, 0), s_); den += cv2.GaussianBlur(m, (0, 0), s_)
    return num / np.maximum(den[..., None], 1e-4)
F_near = spread(solid, (1.2, 2.5))
# quanto c'è di mano in ogni pixel del bordo: la pelle si mescolava al nero della pochette (K)
K = np.array([36.0, 22.0, 13.0])
a = np.clip((lum0 - K.mean()) / np.maximum(F_near.mean(2) - K.mean(), 40), 0, 1)
a[bag > 0] = np.minimum(a[bag > 0], np.clip((lum0[bag > 0] - 60) / 120, 0, 1))
# solo accanto alla pelle: il resto del contorno della pochette è già sfondo
edge = zone & (cv2.dilate(solid.astype(np.uint8), ell(2)) > 0) & ~(solid & (a > 0.97))
bgn = BGL + rng.normal(0, 0.9, img.shape)
out[edge] = (a[..., None] * F_near + (1 - a[..., None]) * bgn)[edge]

# l'angolo del palmo: dal lato destro della mano scende, gira e raggiunge l'indice (il pollice resta nascosto)
SS = 4
pm = Image.new('L', (W * SS, H * SS), 0)
HEEL = [(471, 844), (471.5, 853), (471.5, 862), (469.5, 870), (464, 876), (456, 878), (447, 877), (438, 873), (432, 864),
        (436, 854), (448, 850), (462, 846)]
ImageDraw.Draw(pm).polygon([(x * SS, y * SS) for x, y in HEEL], fill=255)
heel_raw = np.asarray(pm.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255
heel = heel_raw.copy()
# il lato alto dell'angolo sta dentro la mano: lì l'angolo nuovo sfuma nella pelle vera, senza bordo
TOP = np.array([(432, 864), (436, 854), (448, 850), (462, 846), (471, 844), (474, 844)], np.float32)
ytop = np.interp(xx, TOP[:, 0], TOP[:, 1])
heel = heel * np.clip((yy - ytop) / 9.0, 0, 1) ** 1.5
# colore: la pelle della mano prolungata dentro l'angolo, con l'ombra arancio dei bordi del disegno
skin_c = spread(solid & (lum0 > 150) & (yy < 858), (3, 6, 12))
inside = cv2.distanceTransform((np.maximum(heel, solid.astype(np.float32)) > 0.5).astype(np.uint8), cv2.DIST_L2, 5)
rimc = np.array([224, 128, 66], np.float32)
below = np.clip((yy - 846) / 26.0, 0, 1)                  # sotto, dove la mano gira, l'ombra è più forte
t = (np.exp(-inside / 4.0) * (0.35 + 0.55 * below))[..., None]
shade = skin_c * (1 - t) + rimc * t
# la piega fra l'angolo del palmo e l'indice
crease = np.exp(-((xx - 436.0) ** 2) / 6.0) * np.clip((yy - 856) / 8.0, 0, 1) * np.clip((878 - yy) / 6.0, 0, 1)
shade = shade * (1 - 0.10 * crease[..., None]) + rimc * 0.10 * crease[..., None]
hc = heel[..., None]
out = out * (1 - hc) + shade * hc
# sotto e a destra dell'angolo nuovo resta solo sfondo (lì prima c'era la pochette)
spur = np.zeros((H, W), bool); spur[864:884, 440:484] = True
spur &= (yy > ytop + 4)
hr = heel_raw[..., None]
out[spur] = (out * hr + bgn * (1 - hr))[spur]

Image.fromarray(np.clip(np.round(out), 0, 255).astype(np.uint8)).save(OUT)
changed = (np.abs(out - img).max(2) > 0.5)
ys, xs = np.where(changed)
print('elena-mani-libere.png: ritoccati', int(changed.sum()), 'pixel, nel riquadro', (xs.min(), ys.min(), xs.max(), ys.max()))
