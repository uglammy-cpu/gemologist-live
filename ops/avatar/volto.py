"""Trapianto del volto: il viso della prima illustrazione (elena-volto.png) dentro la nuova (elena-illustrazione.png).

Elena preferisce il volto della prima versione (4 novembre 2026): più realistico. La figura, la posa, la lente e il
diamante vengono dalla nuova illustrazione; occhi, sopracciglia, naso e bocca dalla prima.

La trasformazione è un'affine (scala, piccola rotazione, spostamento) misurata a mano sui due volti:
centro delle guance e linea degli occhi. La stessa trasformazione serve per portare avanti e indietro le varianti
(occhi chiusi, bocca aperta), che restano disegnate nelle coordinate della prima illustrazione.
"""
import numpy as np, cv2

SX, SY = 0.84, 0.79            # il volto nuovo è più piccolo e un po' più largo in proporzione
OLD_C = (638.5, 243.0)         # centro delle guance (x) e linea degli occhi (y) nella prima illustrazione
NEW_C = (624.0, 208.5)         # gli stessi punti nella nuova
# Con 0.75 il viso vecchio restava stretto a sinistra e dentro il contorno entrava l'ombra della tempia
# (capelli e guancia in ombra della prima illustrazione): con 0.84 i bordi del viso coincidono su tutti e due i lati.
ROT = np.deg2rad(-0.9)

# contorno del volto nella nuova illustrazione: dentro c'è il viso della prima, fuori resta tutto com'è
NEW_FACE = [(588, 103), (575, 116), (569, 130), (565, 145), (567, 160), (564, 175), (560, 190), (556, 205), (552, 220), (549, 235),
            (549, 250), (556, 265), (565, 280), (568, 295), (570, 310), (586, 325), (617, 340), (640, 346), (670, 340), (686, 325),
            (702, 310), (713, 295), (717, 280), (720, 265), (722, 250), (723, 235), (721, 220), (718, 205), (714, 190), (709, 175),
            (703, 160), (700, 145), (694, 130), (687, 116), (674, 103), (631, 98)]


def old_to_new():
    c, s = np.cos(ROT), np.sin(ROT)
    A = np.array([[SX * c, -SY * s], [SX * s, SY * c]])
    t = np.array(NEW_C) - A @ np.array(OLD_C)
    return np.hstack([A, t[:, None]])


def new_to_old():
    return cv2.invertAffineTransform(old_to_new())


def warp(img, M, shape):
    """Immagine (float) portata con la matrice M nel quadro di misura shape."""
    img = img.astype(np.float32)
    return cv2.warpAffine(img, M, (shape[1], shape[0]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def face_mask(shape):
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.array(NEW_FACE, np.int32)], 1)
    return m.astype(np.float32)


def transplant(new_rgb, old_rgb):
    """Volto vecchio dentro il contorno nuovo, con il colore portato a quello della pelle nuova e il bordo sfumato."""
    mask = face_mask(new_rgb.shape)
    w = warp(old_rgb, old_to_new(), new_rgb.shape)
    inner = cv2.erode((mask > 0.5).astype(np.uint8), np.ones((9, 9), np.uint8))
    ring = (mask > 0.5) & (inner == 0) & (new_rgb.mean(2) > 150) & (w.mean(2) > 150)
    wc = w.copy()
    for c in range(3):
        ms, ss = w[..., c][ring].mean(), w[..., c][ring].std()
        md, sd = new_rgb[..., c][ring].mean(), new_rgb[..., c][ring].std()
        k = 0.5 + 0.5 * (sd / max(ss, 1e-3))      # metà correzione del contrasto: il volto vecchio resta vivo
        wc[..., c] = (w[..., c] - ms) * k + md
    soft = cv2.GaussianBlur(cv2.erode(mask, np.ones((5, 5), np.uint8)), (0, 0), 3.0)[..., None]
    return new_rgb * (1 - soft) + np.clip(wc, 0, 255) * soft


def apply_in_old_frame(base_new, fn, old_shape):
    """Applica fn (scritta per le coordinate della prima illustrazione) al volto della nuova.

    Si porta l'immagine nel quadro vecchio, si applica fn, si riporta indietro e si tiene solo dove fn ha cambiato
    qualcosa: il resto dell'immagine non passa da nessun ricampionamento.
    """
    old_frame = warp(base_new, new_to_old(), old_shape)
    changed = fn(old_frame)
    back = warp(changed, old_to_new(), base_new.shape)
    same = warp(old_frame, old_to_new(), base_new.shape)
    d = (np.abs(back - same).max(2) > 1.5).astype(np.uint8)
    d = cv2.dilate(d, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    w = cv2.GaussianBlur(d.astype(np.float32), (0, 0), 1.2)[..., None]
    out = base_new * (1 - w) + back * w
    ys, xs = np.where(d > 0)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1) if len(xs) else None
    return out, box
