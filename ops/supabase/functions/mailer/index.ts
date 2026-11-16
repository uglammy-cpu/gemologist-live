// Edge function "mailer": svuota la coda public.outbox.
// Si invia davvero solo con MAIL_MODE = 'live' in app_config e la chiave RESEND_API_KEY nei segreti.
// In qualunque altro caso le email restano nella coda con stato 'held': si leggono nel pannello, non partono.
// 4 novembre 2026: conferma di candidatura con i tempi di risposta, email di approvazione con il link di pagamento
// (solo con Stripe in produzione: altrimenti resta 'blocked'), email di attivazione con il link del pannello.
// Versione 7 (pubblicata il 15/11/2026 con l'OK di Elena delle 13:18): promemoria delle dirette salvate
// con «Remind me» (reminder) e avvisi di spostamento o annullamento (reminder_change), con il piè di pagina del Legal
// (LEG-015, sezione D): perché arriva l'email e i link per spegnere i promemoria di quella diretta o tutti.
// Li accodano public.growth_reminders() (ogni 5 minuti) e i trigger delle dirette e delle serate salvate.
// Contengono solo titolo, seller, giorno e ora nel fuso della persona, link per entrare: niente pubblicità né altre dirette (LEG-015, E.7).
// Versione 8 (15/11/2026, richiesta di Elena): pulsante italiano «VAI ALLA LIVE»; nei promemoria niente nome, indirizzo e partita IVA della titolare.
// Versione 9 (15/11/2026, richiesta di Elena): niente nome, indirizzo e partita IVA nemmeno nel piè di pagina delle altre email.
// Versione 10 (15/11/2026, richiesta di Elena): firma «Uniqaia Team» al posto di «Elena Goglio · Uniqaia», frasi dei seller al plurale.
// Versione 11 (16/11/2026, OK di Elena): russo e arabo dei promemoria corretti da Traduzioni (TR-012), con gli spazi non separabili nel russo.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
type L = "it" | "en" | "fr" | "ru" | "ar";
type D = Record<string, string>;
type T = { s: (d: D) => string; b: (d: D) => string; c?: (d: D) => { label: string; url: string } | null };

const eur = (cents: string) => { const n = Number(cents) / 100; return "€" + (Number.isInteger(n) ? String(n) : n.toFixed(2)); };

// Piè di pagina di tutte le email: «Uniqaia», perché arriva l'email e l'informativa privacy (Legal, 9/11/2026).
// Dal 15/11/2026, su richiesta di Elena, niente nome, indirizzo e partita IVA della titolare: restano nell'informativa privacy e nelle note legali del sito.
const FOOT: Record<L, string> = {
  it: "Uniqaia · Ricevi questa email per la tua candidatura o il tuo account su uniqaia.com. Informativa privacy: https://uniqaia.com/privacy/",
  en: "Uniqaia · You are receiving this email about your application or account on uniqaia.com. Privacy notice: https://uniqaia.com/privacy/?lang=en",
  fr: "Uniqaia · Vous recevez cet e-mail au sujet de votre candidature ou de votre compte sur uniqaia.com. Politique de confidentialité : https://uniqaia.com/privacy/?lang=en",
  ru: "Uniqaia · Вы получили это письмо в связи с вашей заявкой или аккаунтом на uniqaia.com. Политика конфиденциальности: https://uniqaia.com/privacy/?lang=en",
  ar: "Uniqaia · تتلقى هذه الرسالة بخصوص طلبك أو حسابك على uniqaia.com. إشعار الخصوصية: https://uniqaia.com/privacy/?lang=en",
};
const foot = (lang: string) => FOOT[lang as L] ?? FOOT.en;
const footHtml = (lang: string) => esc(foot(lang)).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#8a8078">$1</a>');

// Promemoria agli spettatori: solo «Uniqaia», la riga del Legal (LEG-015, sezione D) e i link. Niente nome, indirizzo e partita IVA della titolare (Elena, 15/11): restano nell'informativa privacy.
// Francese, russo e arabo da far rivedere a Traduzioni.
const REMFOOT: Record<L, { pre: string; one: string; all: string; priv: string; url: string }> = {
  it: { pre: "Ricevi questa email perché hai salvato questa diretta su Uniqaia e hai chiesto un promemoria.", one: "Spegni i promemoria di questa diretta", all: "Spegni tutti i promemoria", priv: "Informativa privacy", url: "https://uniqaia.com/privacy/" },
  en: { pre: "You're receiving this email because you saved this live show on Uniqaia and asked for a reminder.", one: "Turn off reminders for this show", all: "Turn off all reminders", priv: "Privacy notice", url: "https://uniqaia.com/privacy/?lang=en" },
  fr: { pre: "Vous recevez cet e-mail parce que vous avez enregistré ce live sur Uniqaia et demandé un rappel.", one: "Désactiver les rappels de ce live", all: "Désactiver tous les rappels", priv: "Politique de confidentialité", url: "https://uniqaia.com/privacy/?lang=en" },
  ru: { pre: "Вы получили это письмо, потому что сохранили этот эфир на Uniqaia и\u00a0попросили напомнить о\u00a0нём.", one: "Выключить напоминания об этом эфире", all: "Выключить все напоминания", priv: "Политика конфиденциальности", url: "https://uniqaia.com/privacy/?lang=en" },
  ar: { pre: "تتلقى هذه الرسالة لأنك حفظت هذا البث على Uniqaia وطلبت تذكيرًا.", one: "إيقاف تذكيرات هذا البث", all: "إيقاف كل التذكيرات", priv: "إشعار الخصوصية", url: "https://uniqaia.com/privacy/?lang=en" },
};
const isRem = (tpl: string) => tpl === "reminder" || tpl === "reminder_change";
const remFoot = (lang: string, d: D) => { const f = REMFOOT[lang as L] ?? REMFOOT.en; return `Uniqaia · ${f.pre} ${f.one}: ${d.off} · ${f.all}: ${d.off_all} · ${f.priv}: ${f.url}`; };
const remFootHtml = (lang: string, d: D) => {
  const f = REMFOOT[lang as L] ?? REMFOOT.en, a = (u: string, t: string) => `<a href="${esc(u)}" style="color:#8a8078">${esc(t)}</a>`;
  return `Uniqaia · ${esc(f.pre)} ${a(d.off, f.one)} · ${a(d.off_all, f.all)} · ${a(f.url, f.priv)}`;
};
const footFor = (tpl: string, lang: string, d: D) => isRem(tpl) ? remFoot(lang, d) : foot(lang);
const footHtmlFor = (tpl: string, lang: string, d: D) => isRem(tpl) ? remFootHtml(lang, d) : footHtml(lang);

// giorno e ora nel fuso della persona (quello del browser quando ha creato l'account)
const LOC: Record<L, string> = { it: "it-IT", en: "en-GB", fr: "fr-FR", ru: "ru-RU", ar: "ar-AE-u-nu-latn" };
const whenTxt = (iso: string, tz: string, lang: string) => {
  try { return new Intl.DateTimeFormat(LOC[lang as L] ?? "en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz || "Europe/Rome", timeZoneName: "short" }).format(new Date(iso)); }
  catch (_e) { return iso; }
};
const W = (d: D, lang: string) => whenTxt(d.at, d.tz, lang), WO = (d: D, lang: string) => whenTxt(d.old_at, d.tz, lang);
const night = (d: D) => d.kind === "night";

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
    it: { s: (d) => `${d.brand}: alcune informazioni per completare la candidatura`, b: (d) => `Gentile ${d.contact},\n\nper valutare la candidatura di ${d.brand} avremmo bisogno di alcune integrazioni:\n\n${d.message}\n\nPuò completarla da questo link, dove troverà i dati già inseriti:\n${d.link}\n\nCordiali saluti,\nUniqaia Team` },
    en: { s: (d) => `${d.brand}: some details to complete your application`, b: (d) => `Dear ${d.contact},\n\nto review the application from ${d.brand} we would need a few additional details:\n\n${d.message}\n\nYou can complete it from this link, where the details already provided are saved:\n${d.link}\n\nKind regards,\nUniqaia Team` },
    fr: { s: (d) => `${d.brand} : quelques informations pour compléter votre candidature`, b: (d) => `Madame, Monsieur ${d.contact},\n\npour examiner la candidature de ${d.brand}, nous aurions besoin de quelques compléments :\n\n${d.message}\n\nVous pouvez la compléter à partir de ce lien, où les informations déjà saisies sont conservées :\n${d.link}\n\nBien cordialement,\nUniqaia Team` },
    ru: { s: (d) => `${d.brand}: нужна дополнительная информация для заявки`, b: (d) => `Уважаемый(ая) ${d.contact},\n\nчтобы рассмотреть заявку ${d.brand}, нам нужны некоторые уточнения:\n\n${d.message}\n\nВы можете дополнить заявку по этой ссылке, уже введённые данные сохранены:\n${d.link}\n\nС уважением,\nUniqaia Team` },
    ar: { s: (d) => `${d.brand}: معلومات إضافية لاستكمال الطلب`, b: (d) => `السيد/السيدة ${d.contact} المحترم/ة،\n\nلدراسة طلب ${d.brand} نحتاج إلى بعض المعلومات الإضافية:\n\n${d.message}\n\nيمكنكم استكمال الطلب من هذا الرابط، حيث ستجدون البيانات التي أدخلتموها:\n${d.link}\n\nمع خالص التحية،\nUniqaia Team` },
  },
  invite: {
    it: { s: (d) => `Invito a presentare ${d.brand} su Uniqaia`, b: (d) => `Gentile ${d.contact},\n\ncome anticipato, Le inviamo il link per confermare la partecipazione di ${d.brand} a Uniqaia. Troverà già compilati i dati di cui abbiamo parlato: La preghiamo di controllarli, completare quelli mancanti, caricare il logo e due fotografie dei prodotti e accettare le condizioni.\n\n${d.link}\n\nCordiali saluti,\nUniqaia Team` },
    en: { s: (d) => `Invitation to present ${d.brand} on Uniqaia`, b: (d) => `Dear ${d.contact},\n\nas discussed, here is the link to confirm the participation of ${d.brand} in Uniqaia. The details we talked about are already filled in: please check them, complete any missing ones, upload your logo and two product photographs, and accept the terms.\n\n${d.link}\n\nKind regards,\nUniqaia Team` },
    fr: { s: (d) => `Invitation à présenter ${d.brand} sur Uniqaia`, b: (d) => `Madame, Monsieur ${d.contact},\n\ncomme convenu, voici le lien pour confirmer la participation de ${d.brand} à Uniqaia. Les informations dont nous avons parlé sont déjà saisies : nous vous remercions de les vérifier, de compléter celles qui manquent, de télécharger votre logo et deux photographies de produits, puis d'accepter les conditions.\n\n${d.link}\n\nBien cordialement,\nUniqaia Team` },
    ru: { s: (d) => `Приглашение представить ${d.brand} на Uniqaia`, b: (d) => `Уважаемый(ая) ${d.contact},\n\nкак мы договорились, направляем ссылку для подтверждения участия ${d.brand} в Uniqaia. Данные, которые мы обсуждали, уже заполнены: пожалуйста, проверьте их, дополните недостающие, загрузите логотип и две фотографии изделий и примите условия.\n\n${d.link}\n\nС уважением,\nUniqaia Team` },
    ar: { s: (d) => `دعوة لعرض ${d.brand} على Uniqaia`, b: (d) => `السيد/السيدة ${d.contact} المحترم/ة،\n\nكما اتفقنا، نرسل إليكم رابط تأكيد مشاركة ${d.brand} في Uniqaia. ستجدون البيانات التي تحدثنا عنها مُدخلة مسبقًا: نرجو مراجعتها واستكمال الناقص منها وتحميل الشعار وصورتين للمنتجات والموافقة على الشروط.\n\n${d.link}\n\nمع خالص التحية،\nUniqaia Team` },
  },
  // approvazione nel nuovo percorso: il link è quello del pagamento, il pannello arriva dopo il pagamento (testo del brief, in inglese)
  approved_payment: {
    en: {
      s: () => `Welcome to Uniqaia — Your Brand Has Been Approved`,
      b: (d) => `Dear ${d.contact},\n\nCongratulations! Your brand has been approved to join Uniqaia.\n\nFirst month: ${eur(d.first_cents)}\nFollowing months: ${eur(d.std_cents)}/month\n\nYour subscription includes ${d.lives} live shows per month, each lasting up to ${d.max_min} minutes.\n\nKind regards,\nUniqaia Team`,
      c: (d) => (d.pay ? { label: "ACTIVATE YOUR SUBSCRIPTION", url: d.pay } : null),
    },
  },
  activated: {
    en: {
      s: (d) => `${d.brand}: your Uniqaia subscription is active`,
      b: (d) => `Dear ${d.contact},\n\nthank you: your payment has been confirmed and the subscription of ${d.brand} to Uniqaia is now active.\n\nYour plan includes ${d.lives} live shows per month, each lasting up to ${d.max_min} minutes, and renews at ${eur(d.std_cents)}/month.\n\nFrom your panel you can prepare and schedule your live shows. The link is personal: please do not forward it, as it allows live shows to be managed on behalf of ${d.brand}.\n\nKind regards,\nUniqaia Team`,
      c: (d) => (d.panel ? { label: "OPEN YOUR PANEL", url: d.panel } : null),
    },
  },
  // modello precedente (pannello subito dopo l'approvazione): resta solo per le email già in coda
  approved: {
    it: { s: (d) => `${d.brand} è stato approvato su Uniqaia`, b: (d) => `Gentile ${d.contact},\n\nsiamo lieti di comunicarLe che la candidatura di ${d.brand} è stata approvata. Da questo link accede al Suo pannello, dove troverà i prossimi passi per preparare la prima diretta:\n\n${d.panel}\n\nIl link è personale: La preghiamo di non inoltrarlo, perché permette di gestire le dirette a nome di ${d.brand}.\n\nCordiali saluti,\nUniqaia Team` },
    en: { s: (d) => `${d.brand} has been approved on Uniqaia`, b: (d) => `Dear ${d.contact},\n\nwe are pleased to let you know that the application from ${d.brand} has been approved. This link opens your panel, where you will find the next steps to prepare your first live show:\n\n${d.panel}\n\nThe link is personal: please do not forward it, as it allows live shows to be managed on behalf of ${d.brand}.\n\nKind regards,\nUniqaia Team` },
  },
  rejected: {
    it: { s: (d) => `La candidatura di ${d.brand} su Uniqaia`, b: (d) => `Gentile ${d.contact},\n\nLa ringraziamo per l'interesse verso Uniqaia. Dopo aver esaminato la candidatura di ${d.brand}, al momento non possiamo inserirla nel palinsesto. Le auguriamo ogni successo e La ringraziamo ancora per il tempo dedicato.\n\nCordiali saluti,\nUniqaia Team` },
    en: { s: (d) => `Your application for ${d.brand} on Uniqaia`, b: (d) => `Dear ${d.contact},\n\nthank you for your interest in Uniqaia. Having reviewed the application from ${d.brand}, we are unable to include it in our schedule at this time. We wish you every success and thank you again for your time.\n\nKind regards,\nUniqaia Team` },
    fr: { s: (d) => `Votre candidature pour ${d.brand} sur Uniqaia`, b: (d) => `Madame, Monsieur ${d.contact},\n\nnous vous remercions de l'intérêt que vous portez à Uniqaia. Après examen de la candidature de ${d.brand}, nous ne pouvons pas l'intégrer à notre programmation pour le moment. Nous vous souhaitons beaucoup de succès et vous remercions encore pour le temps consacré.\n\nBien cordialement,\nUniqaia Team` },
    ru: { s: (d) => `Ваша заявка ${d.brand} на Uniqaia`, b: (d) => `Уважаемый(ая) ${d.contact},\n\nблагодарим вас за интерес к Uniqaia. Рассмотрев заявку ${d.brand}, мы, к сожалению, пока не можем включить её в программу эфиров. Желаем вам успехов и ещё раз благодарим за уделённое время.\n\nС уважением,\nUniqaia Team` },
    ar: { s: (d) => `طلبكم الخاص بـ ${d.brand} على Uniqaia`, b: (d) => `السيد/السيدة ${d.contact} المحترم/ة،\n\nنشكركم على اهتمامكم بـ Uniqaia. بعد دراسة طلب ${d.brand}، لا يمكننا إدراجه في جدول البث في الوقت الحالي. نتمنى لكم كل النجاح ونشكركم مجددًا على وقتكم.\n\nمع خالص التحية،\nUniqaia Team` },
  },
  admin_new: {
    it: { s: (d) => `${d.completed === "true" ? "Candidatura completata" : "Nuova candidatura"}: ${d.brand} (${d.country})`, b: (d) => `${d.completed === "true" ? "Il seller che avevi inserito ha completato e confermato la candidatura" : "È arrivata una candidatura spontanea"}: ${d.brand}, ${d.city} (${d.country}).\n\nLa trovi nel pannello, sezione Candidature, con i dati e le immagini.` },
  },
  // promemoria di una diretta o di una serata salvata: 24 ore prima (slot 24h) o 15 minuti prima (slot 15m)
  reminder: {
    en: {
      s: (d) => d.slot === "15m" ? `Starting in 15 minutes: ${d.title}` : `Tomorrow on Uniqaia: ${d.title}`,
      b: (d) => `Hello,\n\n${night(d) ? "the evening you saved" : "the live show you saved"} ${d.slot === "15m" ? "starts in 15 minutes" : "starts tomorrow"}: ${d.title}${d.seller ? " with " + d.seller : ""}, ${W(d, "en")}.\n\nKind regards,\nUniqaia`,
      c: (d) => ({ label: night(d) ? "SEE THE EVENING" : "JOIN THE LIVE", url: d.url }),
    },
    it: {
      s: (d) => d.slot === "15m" ? `Fra 15 minuti: ${d.title}` : `Domani su Uniqaia: ${d.title}`,
      b: (d) => `Ciao,\n\n${night(d) ? "la serata che hai salvato" : "la diretta che hai salvato"} ${d.slot === "15m" ? "comincia fra 15 minuti" : "è domani"}: ${d.title}${d.seller ? " con " + d.seller : ""}, ${W(d, "it")}.\n\nUniqaia`,
      c: (d) => ({ label: "VAI ALLA LIVE", url: d.url }),
    },
    fr: {
      s: (d) => d.slot === "15m" ? `Dans 15 minutes : ${d.title}` : `Demain sur Uniqaia : ${d.title}`,
      b: (d) => `Bonjour,\n\n${night(d) ? "la soirée que vous avez enregistrée" : "le live que vous avez enregistré"} ${d.slot === "15m" ? "commence dans 15 minutes" : "a lieu demain"} : ${d.title}${d.seller ? " avec " + d.seller : ""}, ${W(d, "fr")}.\n\nUniqaia`,
      c: (d) => ({ label: night(d) ? "VOIR LA SOIRÉE" : "REJOINDRE LE LIVE", url: d.url }),
    },
    ru: {
      s: (d) => d.slot === "15m" ? `Через 15\u00a0минут: ${d.title}` : `Завтра на Uniqaia: ${d.title}`,
      b: (d) => `Здравствуйте!\n\n${night(d) ? "Сохранённый вами вечер" : "Сохранённый вами эфир"} ${d.slot === "15m" ? "начнётся через 15\u00a0минут" : "состоится завтра"}: ${d.title}${d.seller ? " с\u00a0" + d.seller : ""}, ${W(d, "ru")}.\n\nUniqaia`,
      c: (d) => ({ label: night(d) ? "ОТКРЫТЬ ВЕЧЕР" : "ПЕРЕЙТИ В\u00a0ЭФИР", url: d.url }),
    },
    ar: {
      s: (d) => d.slot === "15m" ? `بعد 15 دقيقة: ${d.title}` : `غدًا على Uniqaia: ${d.title}`,
      b: (d) => `مرحبًا،\n\n${night(d) ? "الأمسية التي حفظتها" : "البث الذي حفظته"} ${d.slot === "15m" ? (night(d) ? "تبدأ بعد 15 دقيقة" : "يبدأ بعد 15 دقيقة") : (night(d) ? "موعدها غدًا" : "موعده غدًا")}: ${d.title}${d.seller ? " مع " + d.seller : ""}، ${W(d, "ar")}.\n\nUniqaia`,
      c: (d) => ({ label: night(d) ? "اذهب إلى الأمسية" : "ادخل إلى البث", url: d.url }),
    },
  },
  // una diretta o una serata salvata è stata spostata (change = moved) o annullata (cancelled): nessun pulsante se annullata
  reminder_change: {
    en: {
      s: (d) => d.change === "moved" ? `New time: ${d.title}` : `Cancelled: ${d.title}`,
      b: (d) => d.change === "moved"
        ? `Hello,\n\n${night(d) ? "the evening you saved" : "the live show you saved"}, ${d.title}${d.seller ? " with " + d.seller : ""}, has been moved.\n\nNew time: ${W(d, "en")}\nPrevious time: ${WO(d, "en")}\n\nYour reminders now follow the new time.\n\nKind regards,\nUniqaia`
        : `Hello,\n\n${night(d) ? "the evening you saved" : "the live show you saved"}, ${d.title}${d.seller ? " with " + d.seller : ""}, planned for ${WO(d, "en")}, has been cancelled. We have removed it from My Saved Lives.\n\nKind regards,\nUniqaia`,
      c: (d) => d.change === "moved" ? { label: night(d) ? "SEE THE EVENING" : "SEE THE LIVE", url: d.url } : null,
    },
    it: {
      s: (d) => d.change === "moved" ? `Nuovo orario: ${d.title}` : `Annullata: ${d.title}`,
      b: (d) => d.change === "moved"
        ? `Ciao,\n\n${night(d) ? "la serata che hai salvato" : "la diretta che hai salvato"}, ${d.title}${d.seller ? " con " + d.seller : ""}, è stata spostata.\n\nNuovo orario: ${W(d, "it")}\nOrario precedente: ${WO(d, "it")}\n\nI promemoria seguono il nuovo orario.\n\nUniqaia`
        : `Ciao,\n\n${night(d) ? "la serata che hai salvato" : "la diretta che hai salvato"}, ${d.title}${d.seller ? " con " + d.seller : ""}, prevista per ${WO(d, "it")}, è stata annullata. L'abbiamo tolta da Le mie dirette.\n\nUniqaia`,
      c: (d) => d.change === "moved" ? { label: "VAI ALLA LIVE", url: d.url } : null,
    },
    fr: {
      s: (d) => d.change === "moved" ? `Nouvel horaire : ${d.title}` : `Annulé${night(d) ? "e" : ""} : ${d.title}`,
      b: (d) => d.change === "moved"
        ? `Bonjour,\n\n${night(d) ? "la soirée que vous avez enregistrée" : "le live que vous avez enregistré"}, ${d.title}${d.seller ? " avec " + d.seller : ""}, a été déplacé${night(d) ? "e" : ""}.\n\nNouvel horaire : ${W(d, "fr")}\nAncien horaire : ${WO(d, "fr")}\n\nVos rappels suivent le nouvel horaire.\n\nUniqaia`
        : `Bonjour,\n\n${night(d) ? "la soirée que vous avez enregistrée" : "le live que vous avez enregistré"}, ${d.title}${d.seller ? " avec " + d.seller : ""}, prévu${night(d) ? "e" : ""} le ${WO(d, "fr")}, a été annulé${night(d) ? "e" : ""}. Nous l'avons retiré${night(d) ? "e" : ""} de Mes lives.\n\nUniqaia`,
      c: (d) => d.change === "moved" ? { label: night(d) ? "VOIR LA SOIRÉE" : "VOIR LE LIVE", url: d.url } : null,
    },
    ru: {
      s: (d) => d.change === "moved" ? `Новое время: ${d.title}` : `Отменено: ${d.title}`,
      b: (d) => d.change === "moved"
        ? `Здравствуйте!\n\n${night(d) ? "Сохранённый вами вечер" : "Сохранённый вами эфир"}\u00a0— ${d.title}${d.seller ? " с\u00a0" + d.seller : ""}\u00a0— перенесён.\n\nНовое время: ${W(d, "ru")}\nПрежнее время: ${WO(d, "ru")}\n\nНапоминания придут по новому времени.\n\nUniqaia`
        : `Здравствуйте!\n\n${night(d) ? "Сохранённый вами вечер" : "Сохранённый вами эфир"}\u00a0— ${d.title}${d.seller ? " с\u00a0" + d.seller : ""}\u00a0— отменён.\n\nЗапланированное время: ${WO(d, "ru")}\n\nМы убрали его из раздела «Мои эфиры».\n\nUniqaia`,
      c: (d) => d.change === "moved" ? { label: night(d) ? "ОТКРЫТЬ ВЕЧЕР" : "ОТКРЫТЬ ЭФИР", url: d.url } : null,
    },
    ar: {
      s: (d) => d.change === "moved" ? `موعد جديد: ${d.title}` : `تم الإلغاء: ${d.title}`,
      b: (d) => d.change === "moved"
        ? `مرحبًا،\n\n${night(d) ? "تم تغيير موعد الأمسية التي حفظتها" : "تم تغيير موعد البث الذي حفظته"}: ${d.title}${d.seller ? " مع " + d.seller : ""}.\n\nالموعد الجديد: ${W(d, "ar")}\nالموعد السابق: ${WO(d, "ar")}\n\nستصلك التذكيرات حسب الموعد الجديد.\n\nUniqaia`
        : `مرحبًا،\n\n${night(d) ? "تم إلغاء الأمسية التي حفظتها" : "تم إلغاء البث الذي حفظته"}: ${d.title}${d.seller ? " مع " + d.seller : ""}، ${night(d) ? "وكان موعدها" : "وكان موعده"} ${WO(d, "ar")}. ${night(d) ? "أزلناها" : "أزلناه"} من «بثوثي».\n\nUniqaia`,
      c: (d) => d.change === "moved" ? { label: night(d) ? "اذهب إلى الأمسية" : "اذهب إلى البث", url: d.url } : null,
    },
  },
  // allarmi tecnici di Nikita (P0/P1) per Elena: li accoda ops._email_alert solo con MAIL_MODE = live
  ops_alert: {
    it: {
      s: (d) => (d.kind === "resolved" ? `[Uniqaia · risolto] ${d.title}` : `[Uniqaia · ${d.severity}] ${d.title}`).slice(0, 180),
      b: (d) => d.kind === "resolved"
        ? `Ciao Elena,\n\nil problema segnalato da Nikita è risolto: un nuovo test lo ha confermato.\n\n${d.title}\n\nGilda · Uniqaia`
        : `Ciao Elena,\n\nNikita ha trovato un problema ${d.severity} (area: ${d.area}) il ${d.opened}.\n\n${d.title}\n\nImpatto: ${d.impact || "—"}\nCosa fare: ${d.fix || "—"}\n\nProva tecnica:\n${d.evidence}\n\nGilda · Uniqaia`,
    },
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const button = (c: { label: string; url: string }) =>
  `<p style="margin:28px 0"><a href="${esc(c.url)}" style="display:inline-block;background:#1C1406;color:#EDD596;text-decoration:none;padding:14px 26px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:.12em">${esc(c.label)}</a></p>`;
const html = (text: string, lang: string, cta: { label: string; url: string } | null, footer?: string) => {
  const [head, ...rest] = esc(text).split("\n\nKind regards,");
  const body = (s: string) => s.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#86683B">$1</a>').replace(/\n/g, "<br>");
  const main = cta && rest.length ? body(head) + button(cta) + body("Kind regards," + rest.join("\n\nKind regards,")) : body(esc(text)) + (cta ? button(cta) : "");
  return `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><body style="margin:0;background:#FBF8F2;font-family:Georgia,serif;color:#2B2520"><div style="max-width:560px;margin:0 auto;padding:32px 24px;font-size:16px;line-height:1.6">${main}<p style="margin-top:32px;font-size:12px;color:#8a8078">${footer ?? footHtml(lang)}</p></div></body></html>`;
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
    // promemoria senza i due link per spegnerli: non partono (LEG-015, E.7)
    if (isRem(r.template) && (!d.off || !d.off_all)) { await sb.from("outbox").update({ status: "failed", error: "mancano i link per spegnere i promemoria" }).eq("id", r.id); failed++; continue; }
    const text = t.b(d) + (cta ? `\n\n${cta.label}:\n${cta.url}` : "") + "\n\n--\n" + footFor(r.template, r.lang, d);
    if (!live) { await sb.from("outbox").update({ status: "held", subject }).eq("id", r.id); held++; continue; }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": `uq-mail-${r.id}` },
        body: JSON.stringify({ from: c.MAIL_FROM || "Uniqaia <seller@uniqaia.com>", to: [r.to_email], reply_to: "seller@uniqaia.com", subject, text, html: html(t.b(d), r.lang, cta, footHtmlFor(r.template, r.lang, d)) }),
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
