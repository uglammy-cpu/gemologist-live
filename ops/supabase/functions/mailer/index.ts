// Edge function "mailer": svuota la coda public.outbox.
// Si invia davvero solo con MAIL_MODE = 'live' in app_config e la chiave RESEND_API_KEY nei segreti.
// In qualunque altro caso le email restano nella coda con stato 'held': si leggono nel pannello, non partono.
// 4 novembre 2026: conferma di candidatura con i tempi di risposta, email di approvazione con il link di pagamento
// (solo con Stripe in produzione: altrimenti resta 'blocked'), email di attivazione con il link del pannello.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
type L = "it" | "en" | "fr" | "ru" | "ar";
type D = Record<string, string>;
type T = { s: (d: D) => string; b: (d: D) => string; c?: (d: D) => { label: string; url: string } | null };

const eur = (cents: string) => { const n = Number(cents) / 100; return "€" + (Number.isInteger(n) ? String(n) : n.toFixed(2)); };

// Testi di sistema. Russo e arabo non ancora rivisti da madrelingua.
const TPL: Record<string, Partial<Record<L, T>>> = {
  received: {
    it: { s: (d) => `Candidatura ricevuta: ${d.brand}`, b: (d) => `Gentile ${d.contact},\n\nLa ringraziamo per aver candidato ${d.brand} a Uniqaia. Il nostro team esaminerà la candidatura entro 24 ore.\n\nIn caso di approvazione, riceverà un link di pagamento sicuro ${d.offer === "true" ? "con l'offerta di benvenuto già applicata" : "per attivare l'abbonamento"}.\n\nCordiali saluti,\nUniqaia` },
    en: { s: (d) => `Application received: ${d.brand}`, b: (d) => `Dear ${d.contact},\n\nthank you for applying to Uniqaia. Our team will review your brand within 24 hours.\n\nIf approved, you will receive a secure payment link ${d.offer === "true" ? "with your welcome offer applied" : "to activate your subscription"}.\n\nKind regards,\nUniqaia` },
    fr: { s: (d) => `Candidature reçue : ${d.brand}`, b: (d) => `Madame, Monsieur ${d.contact},\n\nnous vous remercions d'avoir présenté la candidature de ${d.brand} à Uniqaia. Notre équipe l'examinera sous 24 heures.\n\nEn cas d'approbation, vous recevrez un lien de paiement sécurisé ${d.offer === "true" ? "avec votre offre de bienvenue déjà appliquée" : "pour activer votre abonnement"}.\n\nBien cordialement,\nUniqaia` },
    ru: { s: (d) => `Заявка получена: ${d.brand}`, b: (d) => `Уважаемый(ая) ${d.contact},\n\nблагодарим вас за заявку ${d.brand} на участие в Uniqaia. Наша команда рассмотрит её в течение 24 часов.\n\nВ случае одобрения вы получите защищённую ссылку на оплату ${d.offer === "true" ? "с уже применённым приветственным предложением" : "для активации подписки"}.\n\nС уважением,\nUniqaia` },
    ar: { s: (d) => `تم استلام الطلب: ${d.brand}`, b: (d) => `السيد/السيدة ${d.contact} المحترم/ة،\n\nنشكركم على تقديم طلب ${d.brand} للانضمام إلى Uniqaia. سيراجع فريقنا الطلب خلال 24 ساعة.\n\nفي حال الموافقة، ستتلقون رابط دفع آمنًا ${d.offer === "true" ? "مع تطبيق عرضكم الترحيبي" : "لتفعيل اشتراككم"}.\n\nمع خالص التحية،\nUniqaia` },
  },
  info_request: {
    it: { s: (d) => `${d.brand}: alcune informazioni per completare la candidatura`, b: (d) => `Gentile ${d.contact},\n\nper valutare la candidatura di ${d.brand} avremmo bisogno di alcune integrazioni:\n\n${d.message}\n\nPuò completarla da questo link, dove troverà i dati già inseriti:\n${d.link}\n\nCordiali saluti,\nElena Goglio · Uniqaia` },
    en: { s: (d) => `${d.brand}: some details to complete your application`, b: (d) => `Dear ${d.contact},\n\nto review the application from ${d.brand} we would need a few additional details:\n\n${d.message}\n\nYou can complete it from this link, where the details already provided are saved:\n${d.link}\n\nKind regards,\nElena Goglio · Uniqaia` },
    fr: { s: (d) => `${d.brand} : quelques informations pour compléter votre candidature`, b: (d) => `Madame, Monsieur ${d.contact},\n\npour examiner la candidature de ${d.brand}, nous aurions besoin de quelques compléments :\n\n${d.message}\n\nVous pouvez la compléter à partir de ce lien, où les informations déjà saisies sont conservées :\n${d.link}\n\nBien cordialement,\nElena Goglio · Uniqaia` },
    ru: { s: (d) => `${d.brand}: нужна дополнительная информация для заявки`, b: (d) => `Уважаемый(ая) ${d.contact},\n\nчтобы рассмотреть заявку ${d.brand}, нам нужны некоторые уточнения:\n\n${d.message}\n\nВы можете дополнить заявку по этой ссылке, уже введённые данные сохранены:\n${d.link}\n\nС уважением,\nЭлена Гольо · Uniqaia` },
    ar: { s: (d) => `${d.brand}: معلومات إضافية لاستكمال الطلب`, b: (d) => `السيد/السيدة ${d.contact} المحترم/ة،\n\nلدراسة طلب ${d.brand} نحتاج إلى بعض المعلومات الإضافية:\n\n${d.message}\n\nيمكنكم استكمال الطلب من هذا الرابط، حيث ستجدون البيانات التي أدخلتموها:\n${d.link}\n\nمع خالص التحية،\nإيلينا غولْيو · Uniqaia` },
  },
  invite: {
    it: { s: (d) => `Invito a presentare ${d.brand} su Uniqaia`, b: (d) => `Gentile ${d.contact},\n\ncome anticipato, Le invio il link per confermare la partecipazione di ${d.brand} a Uniqaia. Troverà già compilati i dati di cui abbiamo parlato: La prego di controllarli, completare quelli mancanti, caricare il logo e due fotografie dei prodotti e accettare le condizioni.\n\n${d.link}\n\nCordiali saluti,\nElena Goglio · Uniqaia` },
    en: { s: (d) => `Invitation to present ${d.brand} on Uniqaia`, b: (d) => `Dear ${d.contact},\n\nas discussed, here is the link to confirm the participation of ${d.brand} in Uniqaia. The details we talked about are already filled in: please check them, complete any missing ones, upload your logo and two product photographs, and accept the terms.\n\n${d.link}\n\nKind regards,\nElena Goglio · Uniqaia` },
    fr: { s: (d) => `Invitation à présenter ${d.brand} sur Uniqaia`, b: (d) => `Madame, Monsieur ${d.contact},\n\ncomme convenu, voici le lien pour confirmer la participation de ${d.brand} à Uniqaia. Les informations dont nous avons parlé sont déjà saisies : je vous remercie de les vérifier, de compléter celles qui manquent, de télécharger votre logo et deux photographies de produits, puis d'accepter les conditions.\n\n${d.link}\n\nBien cordialement,\nElena Goglio · Uniqaia` },
    ru: { s: (d) => `Приглашение представить ${d.brand} на Uniqaia`, b: (d) => `Уважаемый(ая) ${d.contact},\n\nкак мы договорились, направляю ссылку для подтверждения участия ${d.brand} в Uniqaia. Данные, которые мы обсуждали, уже заполнены: пожалуйста, проверьте их, дополните недостающие, загрузите логотип и две фотографии изделий и примите условия.\n\n${d.link}\n\nС уважением,\nЭлена Гольо · Uniqaia` },
    ar: { s: (d) => `دعوة لعرض ${d.brand} على Uniqaia`, b: (d) => `السيد/السيدة ${d.contact} المحترم/ة،\n\nكما اتفقنا، أرسل إليكم رابط تأكيد مشاركة ${d.brand} في Uniqaia. ستجدون البيانات التي تحدثنا عنها مُدخلة مسبقًا: نرجو مراجعتها واستكمال الناقص منها وتحميل الشعار وصورتين للمنتجات والموافقة على الشروط.\n\n${d.link}\n\nمع خالص التحية،\nإيلينا غولْيو · Uniqaia` },
  },
  // approvazione nel nuovo percorso: il link è quello del pagamento, il pannello arriva dopo il pagamento (testo del brief, in inglese)
  approved_payment: {
    en: {
      s: () => `Welcome to Uniqaia — Your Brand Has Been Approved`,
      b: (d) => `Dear ${d.contact},\n\nCongratulations! Your brand has been approved to join Uniqaia.\n\n${d.offer === "true" ? "Your exclusive welcome offer is ready.\n\n" : ""}First month: ${eur(d.first_cents)}\nFollowing months: ${eur(d.std_cents)}/month\n\nYour subscription includes ${d.lives} live shows per month, each lasting up to ${d.max_min} minutes.\n\nKind regards,\nElena Goglio · Uniqaia`,
      c: (d) => (d.pay ? { label: "ACTIVATE YOUR SUBSCRIPTION", url: d.pay } : null),
    },
  },
  activated: {
    en: {
      s: (d) => `${d.brand}: your Uniqaia subscription is active`,
      b: (d) => `Dear ${d.contact},\n\nthank you: your payment has been confirmed and the subscription of ${d.brand} to Uniqaia is now active.\n\nYour plan includes ${d.lives} live shows per month, each lasting up to ${d.max_min} minutes, and renews at ${eur(d.std_cents)}/month.\n\nFrom your panel you can prepare and schedule your live shows. The link is personal: please do not forward it, as it allows live shows to be managed on behalf of ${d.brand}.\n\nKind regards,\nElena Goglio · Uniqaia`,
      c: (d) => (d.panel ? { label: "OPEN YOUR PANEL", url: d.panel } : null),
    },
  },
  // modello precedente (pannello subito dopo l'approvazione): resta solo per le email già in coda
  approved: {
    it: { s: (d) => `${d.brand} è stato approvato su Uniqaia`, b: (d) => `Gentile ${d.contact},\n\nsono lieta di comunicarLe che la candidatura di ${d.brand} è stata approvata. Da questo link accede al Suo pannello, dove troverà i prossimi passi per preparare la prima diretta:\n\n${d.panel}\n\nIl link è personale: La prego di non inoltrarlo, perché permette di gestire le dirette a nome di ${d.brand}.\n\nCordiali saluti,\nElena Goglio · Uniqaia` },
    en: { s: (d) => `${d.brand} has been approved on Uniqaia`, b: (d) => `Dear ${d.contact},\n\nI am pleased to let you know that the application from ${d.brand} has been approved. This link opens your panel, where you will find the next steps to prepare your first live show:\n\n${d.panel}\n\nThe link is personal: please do not forward it, as it allows live shows to be managed on behalf of ${d.brand}.\n\nKind regards,\nElena Goglio · Uniqaia` },
  },
  rejected: {
    it: { s: (d) => `La candidatura di ${d.brand} su Uniqaia`, b: (d) => `Gentile ${d.contact},\n\nLa ringrazio per l'interesse verso Uniqaia. Dopo aver esaminato la candidatura di ${d.brand}, al momento non possiamo inserirla nel palinsesto. Le auguro ogni successo e La ringrazio ancora per il tempo dedicato.\n\nCordiali saluti,\nElena Goglio · Uniqaia` },
    en: { s: (d) => `Your application for ${d.brand} on Uniqaia`, b: (d) => `Dear ${d.contact},\n\nthank you for your interest in Uniqaia. Having reviewed the application from ${d.brand}, we are unable to include it in our schedule at this time. I wish you every success and thank you again for your time.\n\nKind regards,\nElena Goglio · Uniqaia` },
    fr: { s: (d) => `Votre candidature pour ${d.brand} sur Uniqaia`, b: (d) => `Madame, Monsieur ${d.contact},\n\nje vous remercie de l'intérêt que vous portez à Uniqaia. Après examen de la candidature de ${d.brand}, nous ne pouvons pas l'intégrer à notre programmation pour le moment. Je vous souhaite beaucoup de succès et vous remercie encore pour le temps consacré.\n\nBien cordialement,\nElena Goglio · Uniqaia` },
    ru: { s: (d) => `Ваша заявка ${d.brand} на Uniqaia`, b: (d) => `Уважаемый(ая) ${d.contact},\n\nблагодарю вас за интерес к Uniqaia. Рассмотрев заявку ${d.brand}, мы, к сожалению, пока не можем включить её в программу эфиров. Желаю вам успехов и ещё раз благодарю за уделённое время.\n\nС уважением,\nЭлена Гольо · Uniqaia` },
    ar: { s: (d) => `طلبكم الخاص بـ ${d.brand} على Uniqaia`, b: (d) => `السيد/السيدة ${d.contact} المحترم/ة،\n\nأشكركم على اهتمامكم بـ Uniqaia. بعد دراسة طلب ${d.brand}، لا يمكننا إدراجه في جدول البث في الوقت الحالي. أتمنى لكم كل النجاح وأشكركم مجددًا على وقتكم.\n\nمع خالص التحية،\nإيلينا غولْيو · Uniqaia` },
  },
  admin_new: {
    it: { s: (d) => `${d.completed === "true" ? "Candidatura completata" : "Nuova candidatura"}: ${d.brand} (${d.country})`, b: (d) => `${d.completed === "true" ? "Il seller che avevi inserito ha completato e confermato la candidatura" : "È arrivata una candidatura spontanea"}: ${d.brand}, ${d.city} (${d.country}).\n\nLa trovi nel pannello, sezione Candidature, con i dati e le immagini.` },
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const button = (c: { label: string; url: string }) =>
  `<p style="margin:28px 0"><a href="${esc(c.url)}" style="display:inline-block;background:#1C1406;color:#EDD596;text-decoration:none;padding:14px 26px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:.12em">${esc(c.label)}</a></p>`;
const html = (text: string, lang: string, cta: { label: string; url: string } | null) => {
  const [head, ...rest] = esc(text).split("\n\nKind regards,");
  const body = (s: string) => s.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#86683B">$1</a>').replace(/\n/g, "<br>");
  const main = cta && rest.length ? body(head) + button(cta) + body("Kind regards," + rest.join("\n\nKind regards,")) : body(esc(text)) + (cta ? button(cta) : "");
  return `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><body style="margin:0;background:#FBF8F2;font-family:Georgia,serif;color:#2B2520"><div style="max-width:560px;margin:0 auto;padding:32px 24px;font-size:16px;line-height:1.6">${main}<p style="margin-top:32px;font-size:12px;color:#8a8078">Uniqaia · uniqaia.com</p></div></body></html>`;
};

async function cfg(keys: string[]) {
  const { data } = await sb.from("app_config").select("key,value").in("key", keys);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, string>;
}

Deno.serve(async (req) => {
  const c = await cfg(["MAILER_SECRET", "MAIL_MODE", "MAIL_FROM", "SITE_BASE", "BILLING_MODE"]);
  if (!c.MAILER_SECRET || req.headers.get("x-mailer-secret") !== c.MAILER_SECRET) return new Response("forbidden", { status: 403 });
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  const live = c.MAIL_MODE === "live" && key !== "";
  const base = (c.SITE_BASE || "https://uniqaia.com").replace(/\/$/, "");
  // presa in carico atomica (stato «sending»): due giri del mailer partiti insieme non spediscono la stessa email due volte
  const { data: rows, error } = await sb.rpc("mailer_claim", { p_limit: 25 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  // la modalità dei pagamenti si legge dopo la presa in carico: se Elena è appena passata a «Produzione»
  // le email con i link appena liberate non vengono rimesse in attesa per errore
  const billingMode = (await cfg(["BILLING_MODE"])).BILLING_MODE;
  let sent = 0, held = 0, failed = 0, blocked = 0;
  for (const r of rows ?? []) {
    // mai un link di pagamento se Stripe non è in produzione
    if (r.template === "approved_payment" && billingMode !== "live") { await sb.from("outbox").update({ status: "blocked" }).eq("id", r.id); blocked++; continue; }
    const t = TPL[r.template]?.[r.lang as L] ?? TPL[r.template]?.it ?? TPL[r.template]?.en;
    if (!t) { await sb.from("outbox").update({ status: "failed", error: "modello sconosciuto" }).eq("id", r.id); failed++; continue; }
    const d: D = Object.fromEntries(Object.entries(r.data ?? {}).map(([k, v]) => [k, String(v ?? "")]));
    d.contact = d.contact || d.brand;
    const lq = r.lang === "it" ? "" : `&lang=${r.lang}`;
    if (d.token) d.link = `${base}/join/?t=${d.token}${lq}`;
    if (d.slug && d.key) d.panel = `${base}/${d.slug}/panel/?k=${d.key}`;
    if (d.pay_token) d.pay = `${base}/pay/?t=${d.pay_token}`;
    const subject = t.s(d), cta = t.c ? t.c(d) : null;
    const text = t.b(d) + (cta ? `\n\n${cta.label}:\n${cta.url}` : "");
    if (!live) { await sb.from("outbox").update({ status: "held", subject }).eq("id", r.id); held++; continue; }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": `uq-mail-${r.id}` },
        body: JSON.stringify({ from: c.MAIL_FROM || "Uniqaia <seller@uniqaia.com>", to: [r.to_email], reply_to: "seller@uniqaia.com", subject, text, html: html(t.b(d), r.lang, cta) }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
      await sb.from("outbox").update({ status: "sent", subject, sent_at: new Date().toISOString(), attempts: r.attempts + 1 }).eq("id", r.id); sent++;
    } catch (e) {
      const att = r.attempts + 1;
      await sb.from("outbox").update({ status: att >= 3 ? "failed" : "queued", subject, attempts: att, error: String(e).slice(0, 400) }).eq("id", r.id); failed++;
    }
  }
  return new Response(JSON.stringify({ live, sent, held, failed, blocked }), { headers: { "content-type": "application/json" } });
});
