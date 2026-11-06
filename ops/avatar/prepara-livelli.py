"""Prepara i livelli dell'avatar di Elena: img/avatar/elena.webp, elena-fx.webp e show/_src/avatar-geometria.json.

Uso:  python3 ops/avatar/prepara-livelli.py
Serve: numpy, pillow, opencv-python, onnxruntime e il modello di scontorno isnet-general-use.onnx
       (rilasci di github.com/danielgatis/rembg) in ~/.u2net/.

Da dove viene l'immagine (4 novembre 2026):
  - elena-illustrazione.png  la figura: posa, abiti, lente 10x in una mano, diamante fra pollice e indice nell'altra;
  - elena-volto.png          la prima illustrazione, da cui viene il volto (Elena lo trova più realistico):
                             volto.py lo trapianta nella figura nuova.
Occhi chiusi e bocca aperta sono disegnati nelle coordinate della prima illustrazione (lì sono stati misurati)
e riportati sulla nuova con la stessa trasformazione del volto.
Con un'altra illustrazione vanno rimisurati: il contorno del volto e la trasformazione (volto.py), il braccio
alzato, i punti dei riflessi sul diamante e le zone di capelli, testa e respiro qui sotto.
Tutto quello che serve al motore (avatar.js) finisce in avatar-geometria.json, che build.mjs inserisce da solo.
"""
import os, sys, json, base64, io
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "show", "img", "avatar")
GEO = os.path.join(ROOT, "show", "_src", "avatar-geometria.json")
os.chdir(HERE)
sys.path.insert(0, HERE)

import numpy as np, cv2, onnxruntime as ort
from PIL import Image, ImageDraw
import volto

ILL = np.asarray(Image.open('elena-illustrazione.png').convert('RGB')).astype(np.float32)
OLD = np.asarray(Image.open('elena-volto.png').convert('RGB')).astype(np.float32)
H, W = ILL.shape[:2]

# ---------------------------------------------------------------- 0. scontorno (modello IS-Net)
sess = ort.InferenceSession(os.path.expanduser('~/.u2net/isnet-general-use.onnx'), providers=['CPUExecutionProvider'])
inp = sess.get_inputs()[0]
x = np.asarray(Image.fromarray(ILL.astype(np.uint8)).resize((1024, 1024), Image.LANCZOS)).astype(np.float32) / 255.0
x = x / np.max(x)
x = (x - 0.5) / 1.0
x = x.transpose(2, 0, 1)[None].astype(np.float32)
out = sess.run(None, {inp.name: x})[0][0, 0]
m = (out - out.min()) / (out.max() - out.min())
MASK = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)).astype(np.float32) / 255.0

# ---------------------------------------------------------------- 1. scontorno con decontaminazione dei bordi
# modello dello sfondo: polinomio di 2° grado sui pixel di sfondo sicuro
yy, xx = np.mgrid[0:H, 0:W]
bgsel = MASK < 0.02
sx = xx[bgsel][::37] / W; sy = yy[bgsel][::37] / H
A = np.stack([np.ones_like(sx), sx, sy, sx*sx, sy*sy, sx*sy], 1)
BG = np.zeros_like(ILL)
fx = xx / W; fy = yy / H
Af = np.stack([np.ones_like(fx), fx, fy, fx*fx, fy*fy, fx*fy], -1)
for c in range(3):
    coef, *_ = np.linalg.lstsq(A, ILL[..., c][bgsel][::37], rcond=None)
    BG[..., c] = Af @ coef

# lo sfondo che si vede fra il diamante, il pollice e l'indice: il modello lo tiene, lo togliamo noi
dist = np.sqrt(((ILL - BG) ** 2).sum(2))
hole = np.zeros((H + 2, W + 2), np.uint8)
like_bg = (dist < 14).astype(np.uint8)
box = np.zeros_like(like_bg); box[250:400, 800:960] = 1
fill = (like_bg * box).copy()
for seed in [(895, 335), (880, 345)]:
    if fill[seed[1], seed[0]]:
        cv2.floodFill(fill, hole, seed, 2)
gap = (fill == 2).astype(np.uint8)
near = cv2.dilate(gap, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0
key = np.clip((dist - 8) / 22, 0, 1)
MASK = np.where(near, np.minimum(MASK, key), MASK)
MASK[gap > 0] = 0

a = MASK.copy()
a[a < 0.03] = 0
a3 = a[..., None]
FG = np.where(a3 > 0.04, (ILL - (1 - a3) * BG) / np.maximum(a3, 0.04), ILL)
FG = np.clip(FG, 0, 255)
FG = np.where(a3 > 0.97, ILL, FG)          # per alpha quasi pieno teniamo l'originale (niente rumore)

# ---------------------------------------------------------------- 1b. il volto della prima illustrazione
RGB = volto.transplant(FG, OLD)

# ---------------------------------------------------------------- 2–3. occhi chiusi e bocca aperta (volto_varianti.py)
from volto_varianti import poly_mask, closed_eye, open_mouth

OLD_SHAPE = OLD.shape
CLOSED, EYE_CH = volto.apply_in_old_frame(RGB, closed_eye, OLD_SHAPE)
LEVELS = [5, 10, 16]
MOUTHS, MOUTH_CH = [], []
for D in LEVELS:
    mo, bx = volto.apply_in_old_frame(RGB, lambda im, D=D: open_mouth(im, D), OLD_SHAPE)
    MOUTHS.append(mo); MOUTH_CH.append(bx)


# ---------------------------------------------------------------- 4. pesi delle deformazioni (una griglia sopra la figura)
CX0, CX1 = 330, 1000           # ritaglio orizzontale (figura 348–979)
CY0, CY1 = 0, H
COLS, ROWS = 67, 125           # maglie di circa 10 px: abbastanza fini per lo spazio fra capelli e diamante
FACE_CX = 636.0                # asse del volto
NECK = (636.0, 372.0)          # perno della testa, nel colletto
ELBOW = (925.0, 545.0)         # perno dell'avambraccio alzato (diamante)
LWRIST = (450.0, 705.0)        # perno della mano con la lente (il polso)
HIPS = (640.0, 660.0)          # perno del busto quando si piega appena di lato
SWAY = (640.0, 1250.0)         # perno dell'oscillazione: fra i piedi

def ss(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def poly(pts):
    mk = np.zeros((H, W), np.uint8); cv2.fillPoly(mk, [np.array(pts, np.int32)], 1); return mk

# avambraccio alzato, mano e diamante: si muovono con il corpo, non con la testa né con i capelli
ARM = [(794, 298), (806, 284), (830, 274), (858, 270), (872, 260), (905, 256), (935, 266), (960, 290), (982, 318), (990, 350),
       (984, 392), (970, 420), (966, 460), (962, 505), (952, 535), (930, 556), (900, 572), (866, 580), (850, 560), (856, 520),
       (872, 490), (893, 470), (896, 440), (893, 415), (870, 392), (842, 376), (828, 362), (812, 334), (798, 310)]
arm = poly(ARM).astype(np.float32)
# la mano che pende, con la lente: gira sul polso (la manica resta col busto, così non trascina la giacca)
LARM = [(400, 690), (470, 688), (482, 712), (478, 760), (470, 790), (488, 820), (492, 870), (470, 915), (420, 934), (360, 930),
        (326, 905), (328, 860), (350, 815), (370, 780), (378, 740), (390, 705)]
LSLEEVE = [(405, 540), (500, 540), (502, 700), (405, 700)]
larm = poly(LARM).astype(np.float32)
# capelli: pixel caldi della figura, fuori dal volto e dal braccio (la giacca è nera, quasi senza colore)
warm = (a > 0.5) & ((ILL[..., 0] - ILL[..., 2]) > 28) & (volto.face_mask(ILL.shape) < 0.5) & (arm == 0)
hair = cv2.GaussianBlur(cv2.dilate(warm.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 6.0)
hair = np.clip(hair * 1.6, 0, 1)

X, Y = xx.astype(np.float32), yy.astype(np.float32)
ax = np.abs(X - FACE_CX)
central = 1 - ss(336, 386, Y)                                   # testa e collo
side = ss(113, 154, ax)                                          # ai lati: i capelli lunghi
side_w = (1 - ss(332, 570, Y)) * (1 - ss(345, 400, Y) * (1 - hair))   # sotto le spalle solo dove ci sono capelli
w_head = (central * (1 - side) + side_w * side) * (1 - arm)
outer = (1 - ss(500, 545, X)) + ss(735, 775, X)                  # le ciocche esterne, a sinistra e a destra
w_tip = ss(330, 545, Y) * (1 - ss(565, 600, Y)) * np.clip(outer, 0, 1) * hair * (1 - arm)
w_arm = cv2.GaussianBlur(arm * (1 - ss(450, 540, Y)), (0, 0), 5.0) * (arm > 0)   # dall'avambraccio in su; il gomito resta fermo
w_larm = cv2.GaussianBlur(larm * ss(690, 735, Y), (0, 0), 4.0) * (larm > 0)       # dal polso in giù, fino alla lente
w_torso = np.maximum(1 - ss(600, 700, Y), np.maximum(larm, poly(LSLEEVE)))           # busto, braccia e testa; le gambe no

# fuori dalla figura ogni punto prende i pesi della parte di figura più vicina: così il contorno di ogni parte
# (la mano, il diamante, una ciocca) si muove tutto insieme, e le pieghe della griglia cadono nel vuoto in mezzo
from scipy import ndimage
fig = a > 0.5
_, (iy, ix) = ndimage.distance_transform_edt(~fig, return_indices=True)
def extend(wm):
    return cv2.GaussianBlur(wm[iy, ix].astype(np.float32), (0, 0), 1.5)
w_head, w_tip, w_arm, w_larm, w_torso = extend(w_head), extend(w_tip), extend(w_arm), extend(w_larm), extend(w_torso)

gx = CX0 + (CX1 - CX0) * np.arange(COLS + 1) / COLS
gy = CY0 + (CY1 - CY0) * np.arange(ROWS + 1) / ROWS
GX, GY = np.meshgrid(np.clip(np.round(gx), 0, W - 1).astype(int), np.clip(np.round(gy), 0, H - 1).astype(int))
# due metà affiancate: a sinistra testa, punte dei capelli, braccio del diamante; a destra busto, braccio della lente
WMAP = np.hstack([np.dstack([w_head[GY, GX], w_tip[GY, GX], w_arm[GY, GX]]),
                  np.dstack([w_torso[GY, GX], w_larm[GY, GX], np.zeros_like(w_head[GY, GX])])])
wpng = io.BytesIO()
Image.fromarray(np.clip(np.round(WMAP * 255), 0, 255).astype(np.uint8), 'RGB').save(wpng, 'PNG', optimize=True)

# ---------------------------------------------------------------- 5. esportazione
crop_w, crop_h = CX1 - CX0, CY1 - CY0
base = np.zeros((crop_h, crop_w, 4), np.uint8)
base[:, :, :3] = np.clip(RGB[CY0:CY1, CX0:CX1], 0, 255).astype(np.uint8)
base[:, :, 3] = np.clip(a[CY0:CY1, CX0:CX1] * 255, 0, 255).astype(np.uint8)
Image.fromarray(base, 'RGBA').save(os.path.join(OUT, 'elena.webp'), 'WEBP', quality=88, method=6, alpha_quality=95)

def pad_box(b, mx, my):
    return (b[0] - mx, b[1] - my, b[2] + mx, b[3] + my)
EYE_BOX = pad_box(EYE_CH, 8, 7)
mb = [min(b[0] for b in MOUTH_CH), min(b[1] for b in MOUTH_CH), max(b[2] for b in MOUTH_CH), max(b[3] for b in MOUTH_CH)]
MOUTH_BOX = pad_box(mb, 7, 6)
ew, eh = EYE_BOX[2]-EYE_BOX[0], EYE_BOX[3]-EYE_BOX[1]
mw, mh = MOUTH_BOX[2]-MOUTH_BOX[0], MOUTH_BOX[3]-MOUTH_BOX[1]
AW = max(ew, 3 * mw + 8); AH = eh + 4 + mh
atlas = np.zeros((AH, AW, 3), np.uint8)
atlas[0:eh, 0:ew] = np.clip(CLOSED[EYE_BOX[1]:EYE_BOX[3], EYE_BOX[0]:EYE_BOX[2]], 0, 255).astype(np.uint8)
slots = []
for i, mo in enumerate(MOUTHS):
    ox = i * (mw + 4); oy = eh + 4
    atlas[oy:oy+mh, ox:ox+mw] = np.clip(mo[MOUTH_BOX[1]:MOUTH_BOX[3], MOUTH_BOX[0]:MOUTH_BOX[2]], 0, 255).astype(np.uint8)
    slots.append([ox, oy])
Image.fromarray(atlas).save(os.path.join(OUT, 'elena-fx.webp'), 'WEBP', quality=94, method=6)

ys, xs = np.where(a > 0.5)
geo = {
    "_nota": "Scritto da ops/avatar/prepara-livelli.py: non modificare a mano. Coordinate in pixel dell'illustrazione.",
    "src": [W, H], "crop": [CX0, CY0, crop_w, crop_h],
    "fig": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
    "eye": list(EYE_BOX), "eyeAt": [0, 0], "mouth": list(MOUTH_BOX), "mouthAt": slots, "atlas": [AW, AH],
    "cx": 664, "top": -18, "bottomTall": 1246, "bottomWide": 1010,
    "neck": list(NECK), "elbow": list(ELBOW), "lwrist": list(LWRIST), "hips": list(HIPS), "sway": list(SWAY), "faceX": FACE_CX,
    "breath": [459, 640], "chest": [372, 427, 490, 570],
    "glints": [[862, 284], [824, 297], [889, 300]],
    "grid": [COLS, ROWS], "weights": "data:image/png;base64," + base64.b64encode(wpng.getvalue()).decode()
}
json.dump(geo, open(GEO, 'w'), ensure_ascii=False, indent=1)
print('eye', EYE_BOX, 'mouth', MOUTH_BOX, 'atlas', AW, AH, 'pesi', len(wpng.getvalue()), 'byte')
