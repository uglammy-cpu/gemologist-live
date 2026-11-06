"""Prepara i livelli dell'avatar di Elena a mani libere: img/avatar/elena-libera.webp, elena-libera-fx.webp e
show/_src/avatar-geometria-libera.json.

Uso:  python3 ops/avatar/togli-pochette.py          (una volta: elena-mani-libere.png)
      python3 ops/avatar/prepara-livelli-libera.py
Serve: numpy, pillow, opencv-python, scipy, onnxruntime e il modello di scontorno isnet-general-use.onnx
       (rilasci di github.com/danielgatis/rembg) in ~/.u2net/.

Da dove viene l'immagine (6 novembre 2026): la prima illustrazione (elena-volto.png), con il volto che Elena preferisce,
senza la pochette (togli-pochette.py). È la seconda versione dell'avatar, scelta da Elena: tutte e due le mani libere.
Occhi chiusi e bocca aperta sono disegnati proprio in queste coordinate (volto_varianti.py): niente trapianto.

Le braccia pendono: il motore le fa girare sulle spalle (canali «arm» = braccio a destra nell'immagine, il sinistro di
Elena; «loupe» = braccio a sinistra, il destro di Elena) e piega gli avambracci sui gomiti, così può aprirle, salutare,
indicare il fumetto e accompagnare le parole. Le spalle salgono e scendono; i fianchi passano da un piede all'altro con
i piedi fermi (le misure delle gambe sono in «legs»).
Tutto quello che serve al motore (avatar.js) finisce in avatar-geometria-libera.json, che build.mjs inserisce da solo.
"""
import os, sys, json, base64, io
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "show", "img", "avatar")
GEO = os.path.join(ROOT, "show", "_src", "avatar-geometria-libera.json")
os.chdir(HERE)
sys.path.insert(0, HERE)

import numpy as np, cv2, onnxruntime as ort
from PIL import Image
from scipy import ndimage
import volto
from volto_varianti import closed_eye, open_mouth

ILL = np.asarray(Image.open('elena-mani-libere.png').convert('RGB')).astype(np.float32)
H, W = ILL.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]

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
bgsel = MASK < 0.02
sx = xx[bgsel][::37] / W; sy = yy[bgsel][::37] / H
A = np.stack([np.ones_like(sx), sx, sy, sx*sx, sy*sy, sx*sy], 1)
BG = np.zeros_like(ILL)
fx = xx / W; fy = yy / H
Af = np.stack([np.ones_like(fx), fx, fy, fx*fx, fy*fy, fx*fy], -1)
for c in range(3):
    coef, *_ = np.linalg.lstsq(A, ILL[..., c][bgsel][::37], rcond=None)
    BG[..., c] = Af @ coef

# lo sfondo che si vede fra le gambe e fra le mani e la gonna: se il modello lo tiene, lo togliamo noi
dist = np.sqrt(((ILL - BG) ** 2).sum(2))
like_bg = (dist < 12).astype(np.uint8)
n, lab = cv2.connectedComponents(like_bg, 4)
# solo lo sfondo collegato al bordo dell'immagine (i punti chiari della pelle, simili allo sfondo, restano figura)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
open_bg = np.isin(lab, list(border))
MASK[open_bg] = np.minimum(MASK[open_bg], np.clip((dist[open_bg] - 6) / 18, 0, 1))

a = MASK.copy()
a[a < 0.03] = 0
a3 = a[..., None]
FG = np.where(a3 > 0.04, (ILL - (1 - a3) * BG) / np.maximum(a3, 0.04), ILL)
FG = np.clip(FG, 0, 255)
RGB = np.where(a3 > 0.97, ILL, FG)          # per alpha quasi pieno teniamo l'originale (niente rumore)

# ---------------------------------------------------------------- 2–3. occhi chiusi e bocca aperta (stesse coordinate)
def changed_box(new, old):
    d = (np.abs(new - old).max(2) > 1.5)
    ys, xs = np.where(d)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

CLOSED = closed_eye(RGB); EYE_CH = changed_box(CLOSED, RGB)
LEVELS = [5, 10, 16]
MOUTHS, MOUTH_CH = [], []
for D in LEVELS:
    mo = open_mouth(RGB, D); MOUTHS.append(mo); MOUTH_CH.append(changed_box(mo, RGB))

# ---------------------------------------------------------------- 4. pesi delle deformazioni (una griglia sopra la figura)
CX0, CX1 = 270, 960            # ritaglio orizzontale (figura circa 280–940)
CY0, CY1 = 0, H
COLS, ROWS = 69, 125           # maglie di circa 10 px
FACE_CX = 638.5                # asse del volto
NECK = (639.0, 468.0)          # perno della testa, nel collo alto
RSH = (752.0, 545.0)           # spalla a destra nell'immagine (sinistra di Elena): perno del braccio «arm»
LSH = (522.0, 545.0)           # spalla a sinistra nell'immagine (destra di Elena): perno del braccio «loupe»
HIPS = (640.0, 790.0)          # perno del busto quando si piega appena di lato
SWAY = (622.0, 1252.0)         # perno dell'oscillazione: fra i piedi
RELB = (804.0, 668.0)          # gomito del braccio a destra nell'immagine (dentro la manica)
LELB = (475.0, 668.0)          # gomito del braccio a sinistra
# gambe, per il peso che passa da un piede all'altro: i piedi restano fermi, i fianchi si spostano
LEGS = {"feet": 1236.0, "hips": 800.0, "top": 872.0, "knee": 1035.0, "split": 612.0}

def ss(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def poly(pts):
    mk = np.zeros((H, W), np.uint8); cv2.fillPoly(mk, [np.array(pts, np.int32)], 1); return mk

# le due braccia, dalla spalla alla punta delle dita (manica, polsino, mano)
LARM = [(508, 505), (490, 560), (465, 630), (440, 690), (410, 750), (388, 782), (366, 820), (362, 890), (398, 932),
        (445, 915), (476, 870), (474, 818), (490, 795), (500, 770), (512, 690), (530, 610), (545, 550), (535, 512)]
RARM = [(758, 512), (795, 570), (825, 640), (850, 700), (876, 758), (884, 792), (912, 820), (940, 890), (908, 910),
        (862, 900), (836, 850), (830, 800), (806, 780), (790, 700), (770, 640), (755, 580), (748, 530)]
larm = poly(LARM).astype(np.float32); rarm = poly(RARM).astype(np.float32)
hands = ((larm + rarm) > 0) & (yy > 772)

# volto nelle coordinate di questa illustrazione (il contorno di volto.py riportato indietro)
M = volto.new_to_old()
face_pts = (np.array(volto.NEW_FACE, np.float32) @ M[:, :2].T + M[:, 2]).astype(np.int32)
face = np.zeros((H, W), np.uint8); cv2.fillPoly(face, [face_pts], 1)
face = cv2.dilate(face, np.ones((9, 9), np.uint8)) > 0

# capelli: pixel caldi della figura, fuori dal volto e dalle mani (la giacca è nera, quasi senza colore)
warm = (a > 0.5) & ((ILL[..., 0] - ILL[..., 2]) > 28) & ~face & ~hands
hair = cv2.GaussianBlur(cv2.dilate(warm.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 6.0)
hair = np.clip(hair * 1.6, 0, 1)

X, Y = xx.astype(np.float32), yy.astype(np.float32)
ax = np.abs(X - FACE_CX)
central = 1 - ss(428, 488, Y)                                   # testa e collo
side = ss(140, 185, ax)                                          # ai lati: i capelli lunghi
side_w = (1 - ss(430, 720, Y)) * (1 - ss(450, 510, Y) * (1 - hair))   # sotto le spalle solo dove ci sono capelli
arms = np.clip(larm + rarm, 0, 1)
w_head = (central * (1 - side) + side_w * side) * (1 - arms)
outer = (1 - ss(470, 530, X)) + ss(750, 800, X)                  # le ciocche esterne, a sinistra e a destra
w_tip = ss(420, 640, Y) * (1 - ss(690, 730, Y)) * np.clip(outer, 0, 1) * hair * (1 - 0.7 * arms)
# braccia: tutta la manica e la mano girano sulla spalla; vicino alla spalla il peso cala (la giacca resta ferma),
# e i capelli appoggiati sul braccio lo seguono solo in parte
# le mani intere dentro la zona del braccio: il contorno del poligono non deve passare dentro la mano, altrimenti
# quando il braccio si apre una parte della mano gira meno dell'altra e la mano si allunga
# (si allarga solo su pelle e sfondo: la giacca e la gonna accanto alla mano restano ferme)
skin_or_bg = ((ILL[..., 0] - ILL[..., 2]) > 60) & (ILL.mean(2) > 110) | (a < 0.5)
def whole_hand(poly_m):
    grow = cv2.dilate(poly_m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))) * skin_or_bg
    return np.where(Y > 770, np.maximum(poly_m, grow), poly_m).astype(np.float32)
def arm_w(poly_m, sh):
    poly_m = whole_hand(poly_m)
    ramp = ss(sh[1] - 10, sh[1] + 70, Y)
    w = cv2.GaussianBlur(poly_m * ramp, (0, 0), 6.0)
    return np.clip(w * (1 - 0.25 * hair * (1 - hands)), 0, 1)
w_rarm = arm_w(rarm, RSH)
w_larm = arm_w(larm, LSH)
# avambracci: dal gomito in giù (polsino e mano compresi) girano anche sul gomito
def fore_w(poly_m, el):
    poly_m = whole_hand(poly_m)
    w = cv2.GaussianBlur(poly_m * ss(el[1] - 30, el[1] + 75, Y), (0, 0), 7.0)   # la piega si distribuisce sulla manica
    return np.clip(w * (1 - 0.25 * hair * (1 - hands)), 0, 1)
w_rfore = fore_w(rarm, RELB)
w_lfore = fore_w(larm, LELB)
# spalle: le spalle della giacca e le braccia salgono insieme; il collo e il centro del petto restano fermi
sh_band = ss(430, 480, Y) * (1 - ss(575, 660, Y)) * ss(62, 112, ax)
w_shoulder = np.clip(np.maximum(cv2.GaussianBlur(sh_band.astype(np.float32), (0, 0), 8.0), arms * ss(470, 520, Y)), 0, 1)
w_shoulder = w_shoulder * (1 - 0.6 * hair * (1 - arms))
w_torso = np.maximum(1 - ss(740, 860, Y), np.maximum(w_larm, w_rarm))   # busto, braccia e testa; le gambe no

# fuori dalla figura ogni punto prende i pesi della parte di figura più vicina: così il contorno di ogni parte
# (una mano, una ciocca) si muove tutto insieme, e le pieghe della griglia cadono nel vuoto in mezzo
fig = a > 0.5
_, (iy, ix) = ndimage.distance_transform_edt(~fig, return_indices=True)
def extend(wm):
    return cv2.GaussianBlur(wm[iy, ix].astype(np.float32), (0, 0), 1.5)
w_head, w_tip, w_rarm, w_larm, w_torso = extend(w_head), extend(w_tip), extend(w_rarm), extend(w_larm), extend(w_torso)
w_rfore, w_lfore, w_shoulder = extend(w_rfore), extend(w_lfore), extend(w_shoulder)
# braccia, gomiti e spalle: pesi lisci da una maglia all'altra, così il contorno della manica resta pulito quando si muove
w_rarm, w_larm, w_rfore, w_lfore, w_shoulder = [cv2.GaussianBlur(w, (0, 0), 6.0) for w in (w_rarm, w_larm, w_rfore, w_lfore, w_shoulder)]

gx = CX0 + (CX1 - CX0) * np.arange(COLS + 1) / COLS
gy = CY0 + (CY1 - CY0) * np.arange(ROWS + 1) / ROWS
GX, GY = np.meshgrid(np.clip(np.round(gx), 0, W - 1).astype(int), np.clip(np.round(gy), 0, H - 1).astype(int))
# due metà affiancate, come per la figura con il diamante: a sinistra testa, punte dei capelli, braccio «arm»
# (a destra nell'immagine); a destra busto, braccio «loupe» (a sinistra nell'immagine)
# terza metà (solo questa figura): avambraccio a destra, avambraccio a sinistra, spalle
WMAP = np.hstack([np.dstack([w_head[GY, GX], w_tip[GY, GX], w_rarm[GY, GX]]),
                  np.dstack([w_torso[GY, GX], w_larm[GY, GX], np.zeros_like(w_head[GY, GX])]),
                  np.dstack([w_rfore[GY, GX], w_lfore[GY, GX], w_shoulder[GY, GX]])])
wpng = io.BytesIO()
Image.fromarray(np.clip(np.round(WMAP * 255), 0, 255).astype(np.uint8), 'RGB').save(wpng, 'PNG', optimize=True)

# ---------------------------------------------------------------- 5. esportazione
crop_w, crop_h = CX1 - CX0, CY1 - CY0
base = np.zeros((crop_h, crop_w, 4), np.uint8)
base[:, :, :3] = np.clip(RGB[CY0:CY1, CX0:CX1], 0, 255).astype(np.uint8)
base[:, :, 3] = np.clip(a[CY0:CY1, CX0:CX1] * 255, 0, 255).astype(np.uint8)
Image.fromarray(base, 'RGBA').save(os.path.join(OUT, 'elena-libera.webp'), 'WEBP', quality=88, method=6, alpha_quality=95)

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
Image.fromarray(atlas).save(os.path.join(OUT, 'elena-libera-fx.webp'), 'WEBP', quality=94, method=6)

ys, xs = np.where(a > 0.5)
geo = {
    "_nota": "Scritto da ops/avatar/prepara-livelli-libera.py: non modificare a mano. Coordinate in pixel dell'illustrazione "
             "elena-mani-libere.png. «elbow» e «lwrist» qui sono le due spalle: perni delle braccia «arm» (a destra "
             "nell'immagine) e «loupe» (a sinistra).",
    "id": "libera", "img": "elena-libera.webp", "fx": "elena-libera-fx.webp",
    "src": [W, H], "crop": [CX0, CY0, crop_w, crop_h],
    "fig": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
    "eye": list(EYE_BOX), "eyeAt": [0, 0], "mouth": list(MOUTH_BOX), "mouthAt": slots, "atlas": [AW, AH],
    "cx": 640, "top": -16, "bottomTall": 1262, "bottomWide": 960,
    "neck": list(NECK), "elbow": list(RSH), "lwrist": list(LSH), "hips": list(HIPS), "sway": list(SWAY), "faceX": FACE_CX,
    "breath": [552, 767], "chest": [448, 514, 588, 684],
    "armRange": [-0.17, 0.04], "loupeRange": [-0.04, 0.17],
    "tiles": 3, "relbow": list(RELB), "lelbow": list(LELB), "legs": LEGS,
    "foreRange": [[-0.27, 0.05], [-0.05, 0.27]],   # oltre ~15° la mano si schiaccia: in 2D non può venire verso chi guarda
    "glints": [],
    "grid": [COLS, ROWS], "weights": "data:image/png;base64," + base64.b64encode(wpng.getvalue()).decode()
}
json.dump(geo, open(GEO, 'w'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- 6. immagini fisse per i contenuti (ops/avatar/immagini)
IMM = os.path.join(HERE, 'immagini')
os.makedirs(IMM, exist_ok=True)
x0, y0, x1, y1 = max(0, xs.min() - 2), max(0, ys.min() - 2), min(W, xs.max() + 3), min(H, ys.max() + 3)
fullc = np.zeros((H, W, 4), np.uint8)
fullc[..., :3] = np.clip(RGB, 0, 255).astype(np.uint8); fullc[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
cut = Image.fromarray(fullc[y0:y1, x0:x1], 'RGBA')
cut.save(os.path.join(IMM, 'elena-libera-trasparente.png'), optimize=True)
ivory = Image.new('RGBA', cut.size, (248, 241, 223, 255)); ivory.alpha_composite(cut)
ivory.convert('RGB').save(os.path.join(IMM, 'elena-libera-avorio.png'), optimize=True)
print('fig', geo['fig'], 'eye', EYE_BOX, 'mouth', MOUTH_BOX, 'atlas', AW, AH, 'pesi', len(wpng.getvalue()), 'byte')
