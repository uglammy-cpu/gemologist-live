// 15/11/2026 · Promemoria delle dirette e delle serate salvate con «Remind me» (brief di Elena, LEG-015).
// Da inserire nella funzione «mailer» (versione 6 pubblicata, non nel repository) come TPL.reminder, insieme a whenTxt.
// Li accoda public.growth_reminders() ogni 5 minuti: data = { slot: "24h" | "15m", kind: "show" | "night", title, seller, at (ISO, UTC), tz, url, off }.
// È una comunicazione sull'evento salvato, non promozionale: niente offerte, link per spegnere i promemoria in ogni email.
const whenTxt = (d, loc) => {
  try { return new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: d.tz || "Europe/Rome", timeZoneName: "short" }).format(new Date(d.at)); }
  catch (e) { return d.at; }
};
const REMINDER = {
  en: {
    s: (d) => d.slot === "15m" ? `Starting in 15 minutes: ${d.title}` : `Tomorrow on Uniqaia: ${d.title}`,
    b: (d) => `Hello,\n\n${d.kind === "night" ? "the evening you saved" : "the live you saved"} ${d.slot === "15m" ? "starts in 15 minutes" : "starts tomorrow"}: ${d.title}${d.seller ? " with " + d.seller : ""}, ${whenTxt(d, "en-GB")}.\n\nKind regards,\nUniqaia\n\nThis is a reminder about something you saved on Uniqaia, not a promotional email. To stop these reminders: ${d.off}`,
    c: (d) => ({ label: d.kind === "night" ? "SEE THE EVENING" : "WATCH THE LIVE", url: d.url }),
  },
  it: {
    s: (d) => d.slot === "15m" ? `Fra 15 minuti: ${d.title}` : `Domani su Uniqaia: ${d.title}`,
    b: (d) => `Ciao,\n\n${d.kind === "night" ? "la serata che hai salvato" : "la diretta che hai salvato"} ${d.slot === "15m" ? "comincia fra 15 minuti" : "è domani"}: ${d.title}${d.seller ? " con " + d.seller : ""}, ${whenTxt(d, "it-IT")}.\n\nÈ un promemoria su qualcosa che hai salvato su Uniqaia, non un'email promozionale. Per non ricevere più promemoria: ${d.off}`,
    c: (d) => ({ label: d.kind === "night" ? "VAI ALLA SERATA" : "GUARDA LA DIRETTA", url: d.url }),
  },
  fr: {
    s: (d) => d.slot === "15m" ? `Dans 15 minutes : ${d.title}` : `Demain sur Uniqaia : ${d.title}`,
    b: (d) => `Bonjour,\n\n${d.kind === "night" ? "la soirée que vous avez enregistrée" : "le live que vous avez enregistré"} ${d.slot === "15m" ? "commence dans 15 minutes" : "a lieu demain"} : ${d.title}${d.seller ? " avec " + d.seller : ""}, ${whenTxt(d, "fr-FR")}.\n\nCeci est un rappel concernant un contenu que vous avez enregistré sur Uniqaia, pas un e-mail promotionnel. Pour ne plus recevoir de rappels : ${d.off}`,
    c: (d) => ({ label: d.kind === "night" ? "VOIR LA SOIRÉE" : "REGARDER LE LIVE", url: d.url }),
  },
  ru: {
    s: (d) => d.slot === "15m" ? `Через 15 минут: ${d.title}` : `Завтра на Uniqaia: ${d.title}`,
    b: (d) => `Здравствуйте!\n\n${d.kind === "night" ? "Сохранённый вами вечер" : "Сохранённый вами эфир"} ${d.slot === "15m" ? "начнётся через 15 минут" : "состоится завтра"}: ${d.title}${d.seller ? ", " + d.seller : ""}, ${whenTxt(d, "ru-RU")}.\n\nЭто напоминание о том, что вы сохранили на Uniqaia, а не рекламное письмо. Чтобы больше не получать напоминания: ${d.off}`,
    c: (d) => ({ label: d.kind === "night" ? "ОТКРЫТЬ ВЕЧЕР" : "СМОТРЕТЬ ЭФИР", url: d.url }),
  },
  ar: {
    s: (d) => d.slot === "15m" ? `بعد 15 دقيقة: ${d.title}` : `غدًا على Uniqaia: ${d.title}`,
    b: (d) => `مرحبًا،\n\n${d.kind === "night" ? "الأمسية التي حفظتها" : "البث الذي حفظته"} ${d.slot === "15m" ? "يبدأ بعد 15 دقيقة" : "موعده غدًا"}: ${d.title}${d.seller ? " مع " + d.seller : ""}، ${whenTxt(d, "ar-AE-u-nu-latn")}.\n\nهذا تذكير بشيء حفظته على Uniqaia، وليس رسالة ترويجية. لإيقاف التذكيرات: ${d.off}`,
    c: (d) => ({ label: d.kind === "night" ? "اذهب إلى الأمسية" : "شاهد البث", url: d.url }),
  },
};
if (typeof module !== "undefined") module.exports = { REMINDER, whenTxt };
