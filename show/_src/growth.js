// Crescita dell'audience (brief di Elena del 15/11/2026): Remind Me, accesso spettatori con codice via email, Share con le misure, referral.
// Script comune: lo usano home, pagine di categoria, pagine delle dirette, diretta, scheda del seller e /me/.
// Nessun cookie. Nel browser restano solo la sessione di accesso (libreria di Supabase) e, finché resta aperta la scheda,
// il canale del link condiviso e l'azione da riprendere dopo il link dell'email (sessionStorage).
// Il codice dell'invito NON si salva nel browser (scelta di Elena del 15/11, LEG-015 E.6): resta nell'indirizzo e passa
// alla richiesta di registrazione (dati dell'account in Supabase Auth); nel riquadro di accesso si vede e si può togliere.
(function(){
  if (window.UQG) return;
  var CH = { native:1, wa:1, fb:1, tg:1, rd:1, em:1, copy:1 };
  // Testi: inglese lingua principale (Elena, 15/11). Francese, russo e arabo da far rivedere a Traduzioni.
  var GT = {
    en: { remind:"Remind me", reminded:"Reminder on", interested1:"1 person is interested", interestedN:"{n} people are interested",
      unsaved:"Removed from My Saved Lives.", unavailable:"This live is no longer available.",
      loginT:"Save this live", loginInvite:"Join Uniqaia", loginLead:"We'll email you a link and a code to sign in: no password needed. With an account you can save live shows, get the reminders you choose and have your own link to invite friends.", emailPh:"Your email", sendCode:"Send code",
      codeLead:"We've sent a code to {e}. Enter it here, or tap the link in the email.", codePh:"6-digit code", verify:"Confirm", resend:"Send a new code", otherEmail:"Use another email",
      privacyLink:"Privacy notice",
      legal18:"You must be 18 or over. By continuing you accept the {terms}.", termsLink:"Terms of use", refBox:"A friend invited you · code {code}. They'll only see that their invitation count went up, not your name or email.", refRemove:"Remove code", refField:"Invite code (optional)", savedT:"Saved to My Saved Lives", rem24:"Email 24 hours before", rem15:"Email 15 minutes before", remNote:"We'll only email you about this live show. You can turn reminders off at any time.", done:"Done", allOff:"Reminders are off for all shows: you can turn them back on in My account.",
      errEmail:"Please check the email address.", errCode:"This code is not valid or has expired.", errRate:"Too many attempts: please wait a minute and try again.", errGeneric:"Something went wrong. Please try again.",
      close:"Close", share:"Share", shareT:"Share", copy:"Copy link", copied:"Link copied", email:"Email", more:"More options", igNote:"On your phone, Instagram is in the share menu.",
      me:"My account", signedIn:"Signed in" },
    it: { remind:"Ricordamelo", reminded:"Promemoria attivo", interested1:"1 persona è interessata", interestedN:"{n} persone sono interessate",
      unsaved:"Tolta da Le mie dirette.", unavailable:"Questa diretta non è più disponibile.",
      loginT:"Salva questa diretta", loginInvite:"Entra in Uniqaia", loginLead:"Ti mandiamo per email un link e un codice per entrare: niente password. Con l'account salvi le dirette, ricevi i promemoria che scegli e hai il tuo link per invitare gli amici.", emailPh:"La tua email", sendCode:"Manda il codice",
      codeLead:"Abbiamo mandato un codice a {e}. Scrivilo qui, oppure tocca il link nell'email.", codePh:"Codice di 6 cifre", verify:"Conferma", resend:"Manda un codice nuovo", otherEmail:"Usa un'altra email",
      privacyLink:"Informativa privacy",
      legal18:"Devi avere almeno 18 anni. Continuando accetti le {terms}.", termsLink:"Condizioni d'uso", refBox:"Ti ha invitato un amico · codice {code}. Vedrà solo che il numero dei suoi inviti è salito, non il tuo nome né la tua email.", refRemove:"Togli il codice", refField:"Codice invito (facoltativo)", savedT:"Salvata in Le mie dirette", rem24:"Email 24 ore prima", rem15:"Email 15 minuti prima", remNote:"Ti scriviamo solo per questa diretta. Puoi spegnere i promemoria quando vuoi.", done:"Fatto", allOff:"I promemoria sono spenti per tutte le dirette: puoi riaccenderli in Il mio account.",
      errEmail:"Controlla l'indirizzo email.", errCode:"Il codice non è valido o è scaduto.", errRate:"Troppi tentativi: aspetta un minuto e riprova.", errGeneric:"Qualcosa non ha funzionato. Riprova.",
      close:"Chiudi", share:"Condividi", shareT:"Condividi", copy:"Copia link", copied:"Link copiato", email:"Email", more:"Altre app", igNote:"Sul telefono Instagram è nel menu di condivisione.",
      me:"Il mio account", signedIn:"Accesso fatto" },
    fr: { remind:"Me le rappeler", reminded:"Rappel activé", interested1:"1 personne est intéressée", interestedN:"{n} personnes sont intéressées",
      unsaved:"Retiré de Mes lives.", unavailable:"Ce live n'est plus disponible.",
      loginT:"Enregistrer ce live", loginInvite:"Rejoindre Uniqaia", loginLead:"Nous vous envoyons par e-mail un lien et un code pour vous connecter : pas de mot de passe. Avec un compte, vous enregistrez des lives, recevez les rappels que vous choisissez et avez votre lien pour inviter des amis.", emailPh:"Votre e-mail", sendCode:"Envoyer le code",
      codeLead:"Nous avons envoyé un code à {e}. Saisissez-le ici ou touchez le lien dans l'e-mail.", codePh:"Code à 6 chiffres", verify:"Confirmer", resend:"Envoyer un nouveau code", otherEmail:"Utiliser un autre e-mail",
      privacyLink:"Politique de confidentialité",
      legal18:"Vous devez avoir au moins 18 ans. En continuant, vous acceptez les {terms}.", termsLink:"Conditions d'utilisation", refBox:"Un ami vous a invité · code {code}. Il verra seulement que son nombre d'invitations a augmenté, mais pas votre nom ni votre e-mail.", refRemove:"Retirer le code", refField:"Code d'invitation (facultatif)", savedT:"Enregistré dans Mes lives", rem24:"E-mail 24 heures avant", rem15:"E-mail 15 minutes avant", remNote:"Nous vous écrirons uniquement au sujet de ce live. Vous pouvez désactiver les rappels à tout moment.", done:"OK", allOff:"Les rappels sont désactivés pour tous les lives : vous pouvez les réactiver dans Mon compte.",
      errEmail:"Vérifiez l'adresse e-mail.", errCode:"Ce code n'est pas valide ou a expiré.", errRate:"Trop de tentatives : attendez une minute et réessayez.", errGeneric:"Une erreur s'est produite. Réessayez.",
      close:"Fermer", share:"Partager", shareT:"Partager", copy:"Copier le lien", copied:"Lien copié", email:"E-mail", more:"Autres apps", igNote:"Sur votre téléphone, Instagram se trouve dans le menu de partage.",
      me:"Mon compte", signedIn:"Connecté" },
    ru: { remind:"Напомнить", reminded:"Напоминание включено", interested1:"Интересуется 1\u00a0человек", interestedN:"Интересуются: {n}",
      unsaved:"Удалено из раздела «Мои эфиры».", unavailable:"Этот эфир больше недоступен.",
      loginT:"Сохранить эфир", loginInvite:"Присоединиться к\u00a0Uniqaia", loginLead:"Мы пришлём на e-mail ссылку и\u00a0код для входа: без пароля. С\u00a0аккаунтом можно сохранять эфиры, получать напоминания, которые вы выберете, и\u00a0приглашать друзей по своей ссылке.", emailPh:"Ваш e-mail", sendCode:"Отправить код",
      codeLead:"Мы отправили код на {e}. Введите его здесь или нажмите на ссылку в\u00a0письме.", codePh:"Код из 6\u00a0цифр", verify:"Подтвердить", resend:"Отправить новый код", otherEmail:"Указать другой e-mail",
      privacyLink:"Политика конфиденциальности",
      legal18:"Вам должно быть не менее 18\u00a0лет. Продолжая, вы принимаете {terms}.", termsLink:"Условия использования", refBox:"Вас пригласил друг · код {code}. Он увидит только, что число его приглашений выросло, но не ваше имя и\u00a0не ваш e-mail.", refRemove:"Убрать код", refField:"Код приглашения (необязательно)", savedT:"Сохранено в\u00a0разделе «Мои эфиры»", rem24:"Письмо за 24\u00a0часа", rem15:"Письмо за 15\u00a0минут", remNote:"Мы напишем вам только об этом эфире. Напоминания можно выключить в\u00a0любой момент.", done:"Готово", allOff:"Напоминания выключены для всех эфиров: их можно снова включить в\u00a0разделе «Мой аккаунт».",
      errEmail:"Проверьте адрес e-mail.", errCode:"Код недействителен или устарел.", errRate:"Слишком много попыток: подождите минуту и\u00a0попробуйте снова.", errGeneric:"Что-то пошло не так. Попробуйте ещё раз.",
      close:"Закрыть", share:"Поделиться", shareT:"Поделиться", copy:"Копировать ссылку", copied:"Ссылка скопирована", email:"E-mail", more:"Другие приложения", igNote:"На телефоне Instagram находится в\u00a0меню «Поделиться».",
      me:"Мой аккаунт", signedIn:"Вы вошли" },
    ar: { remind:"ذكّرني", reminded:"التذكير مفعّل", interested1:"شخص واحد مهتم", interestedN:"عدد المهتمين: {n}",
      unsaved:"تمت الإزالة من «بثوثي».", unavailable:"هذا البث لم يعد متاحًا.",
      loginT:"احفظ هذا البث", loginInvite:"انضم إلى Uniqaia", loginLead:"سنرسل إلى بريدك الإلكتروني رابطًا ورمزًا لتسجيل الدخول: لا حاجة إلى كلمة مرور. بالحساب يمكنك حفظ البثوث، وتلقّي التذكيرات التي تختارها، والحصول على رابطك الخاص لدعوة الأصدقاء.", emailPh:"بريدك الإلكتروني", sendCode:"أرسل الرمز",
      codeLead:"أرسلنا رمزًا إلى {e}. أدخله هنا أو اضغط على الرابط في الرسالة.", codePh:"رمز من 6 أرقام", verify:"تأكيد", resend:"أرسل رمزًا جديدًا", otherEmail:"استخدم بريدًا آخر",
      privacyLink:"إشعار الخصوصية",
      legal18:"يجب أن يكون عمرك 18 عامًا على الأقل. بالمتابعة توافق على {terms}.", termsLink:"شروط الاستخدام", refBox:"دعاك صديق · الرمز {code}. سيرى فقط أن عدد دعواته قد زاد، ولن يرى اسمك ولا بريدك الإلكتروني.", refRemove:"إزالة الرمز", refField:"رمز الدعوة (اختياري)", savedT:"تم الحفظ في «بثوثي»", rem24:"رسالة إلكترونية قبل 24 ساعة", rem15:"رسالة إلكترونية قبل 15 دقيقة", remNote:"سنراسلك بشأن هذا البث فقط. يمكنك إيقاف التذكيرات في أي وقت.", done:"تم", allOff:"التذكيرات متوقفة لكل البثوث: يمكنك إعادة تفعيلها من «حسابي».",
      errEmail:"تحقق من عنوان البريد الإلكتروني.", errCode:"الرمز غير صالح أو انتهت صلاحيته.", errRate:"محاولات كثيرة: انتظر دقيقة ثم أعد المحاولة.", errGeneric:"حدث خطأ. أعد المحاولة.",
      close:"إغلاق", share:"مشاركة", shareT:"مشاركة", copy:"نسخ الرابط", copied:"تم نسخ الرابط", email:"البريد الإلكتروني", more:"تطبيقات أخرى", igNote:"على هاتفك، Instagram موجود في قائمة المشاركة.",
      me:"حسابي", signedIn:"تم تسجيل الدخول" }
  };
  var S = { sb:null, lang:"en", base:"", user:null, ready:null, inited:false, mine:{}, counts:{} };
  var ss = { get:function(k){ try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch(e){ return null; } }, set:function(k, v){ try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch(e){} } };
  function T(k){ var t = GT[S.lang] || GT.en; return t[k] != null ? t[k] : GT.en[k]; }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
  function rpc(fn, args){ return S.sb.rpc(fn, args || {}).then(function(r){ if (r.error) throw r.error; return r.data; }); }

  // ---------------------------------------------------------------- indirizzo
  // ?ref= resta nell'indirizzo (così vale anche se si ricarica la pagina) e solo in memoria: niente sessionStorage né localStorage.
  // ?sh= si legge e si toglie subito.
  var Q = new URLSearchParams(location.search);
  function refOk(v){ v = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^[A-Z0-9]{8}$/.test(v) ? v : ""; }
  var refCode = refOk(Q.get("ref"));
  function setUrl(){ try { history.replaceState(null, "", location.pathname + (Q.toString() ? "?" + Q.toString() : "") + location.hash); } catch(e){} }
  function dropRef(){ refCode = ""; if (Q.has("ref")) { Q.delete("ref"); setUrl(); } }
  var sh = Q.get("sh"); if (sh) { if (CH[sh]) ss.set("uq-sh-pending", sh); Q.delete("sh"); setUrl(); }

  // ---------------------------------------------------------------- stile (stessi colori e caratteri del sito)
  var css = '.uqg-m{position:fixed;inset:0;z-index:90;background:rgba(14,12,10,.55);display:flex;align-items:flex-end;justify-content:center}'
    + '@media(min-width:640px){.uqg-m{align-items:center}}'
    + '.uqg-b{background:#fff;color:#16181D;width:100%;max-width:420px;border-radius:22px 22px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom,0px));font-family:Jost,"Helvetica Neue",Arial,sans-serif;box-shadow:0 -10px 40px rgba(0,0,0,.18);max-height:92vh;overflow:auto}'
    + '@media(min-width:640px){.uqg-b{border-radius:22px}}'
    + '.uqg-b h3{font-family:"Bodoni Moda",Didot,Georgia,serif;font-weight:400;font-size:24px;margin:0 0 8px}.uqg-b p{font-size:14.5px;line-height:1.5;color:#5B606A;margin:0 0 14px}'
    + '.uqg-b input{width:100%;box-sizing:border-box;min-height:48px;border:1px solid #E7E4DC;border-radius:12px;padding:0 14px;font:inherit;font-size:16px;margin-bottom:10px}'
    + '.uqg-b input.code{letter-spacing:.4em;text-align:center;font-size:22px}'
    + '.uqg-btn{display:flex;width:100%;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:999px;border:1px solid #16181D;background:none;color:#16181D;font:inherit;font-size:15px;font-weight:500;cursor:pointer;text-decoration:none;box-sizing:border-box}'
    + '.uqg-btn.dark{background:#1C1406;color:#EDD596;border-color:#1C1406}.uqg-btn[disabled]{opacity:.5}'
    + '.uqg-link{background:none;border:0;color:#8C6A2B;font:inherit;font-size:14px;text-decoration:underline;cursor:pointer;padding:8px 0}'
    + '.uqg-small{font-size:12.5px!important;color:#5B606A}.uqg-small a{color:#8C6A2B}.uqg-err{color:#B42318!important;min-height:1.2em}'
    + '.uqg-x{float:right;background:none;border:0;font-size:26px;line-height:1;color:#5B606A;cursor:pointer;margin:-6px -4px 0 0}[dir=rtl] .uqg-x{float:left}'
    + '.uqg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:6px 0 12px}'
    + '.uqg-ch{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px;border:1px solid #E7E4DC;border-radius:14px;background:#fff;color:#16181D;font:inherit;font-size:13px;text-decoration:none;cursor:pointer}'
    + '.uqg-ch i{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#F6F4EF;font-style:normal;font-weight:600;font-size:14px;color:#1C1406}'
    + '.uqg-bell{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #CDB98C;background:#fff;color:#16181D;font:500 13.5px Jost,"Helvetica Neue",Arial,sans-serif;cursor:pointer;white-space:nowrap}'
    + '.uqg-bell svg{width:16px;height:16px}.uqg-bell.on{background:#1C1406;color:#EDD596;border-color:#1C1406}.uqg-bell.icon{width:40px;padding:0}'
    + '.uqg-int{display:block;font-size:12px;color:#8C6A2B;margin-top:4px;text-transform:none!important;letter-spacing:0!important;font-weight:400}'
    + '.uqg-ref{background:#F6F4EF;border-radius:12px;padding:12px 14px;margin:0 0 12px;font-size:13.5px;line-height:1.45;color:#16181D}.uqg-ref .uqg-link{padding:4px 0 0;font-size:13.5px}'
    + '.uqg-chk{display:flex!important;flex-direction:row!important;align-items:center;gap:10px;min-height:44px;font-size:15px;color:#16181D;cursor:pointer}.uqg-chk input{width:20px;height:20px;min-height:0;margin:0;accent-color:#1C1406}'
    + '.uqg-toast{position:fixed;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#1C1406;color:#EDD596;padding:11px 18px;border-radius:999px;font:14px Jost,Arial,sans-serif;z-index:95;max-width:90vw;text-align:center}';
  function addCss(){ if (document.getElementById("uqg-css")) return; var s = document.createElement("style"); s.id = "uqg-css"; s.textContent = css; document.head.appendChild(s); }
  var BELL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  var SHARE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/></svg>';

  function toast(msg){ var t = document.createElement("div"); t.className = "uqg-toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 3200); }
  var modal = null;
  function closeModal(){ if (modal) { modal.remove(); modal = null; } }
  function openModal(html){
    closeModal(); addCss(); modal = document.createElement("div"); modal.className = "uqg-m"; modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    modal.innerHTML = '<div class="uqg-b" dir="' + (S.lang === "ar" ? "rtl" : "ltr") + '"><button type="button" class="uqg-x" aria-label="' + esc(T("close")) + '">×</button>' + html + '</div>';
    modal.addEventListener("click", function(e){ if (e.target === modal || e.target.classList.contains("uqg-x")) closeModal(); });
    document.addEventListener("keydown", function k(e){ if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", k); } });
    document.body.appendChild(modal); return modal;
  }

  // ---------------------------------------------------------------- accesso con codice o link via email
  function afterLogin(){
    if (S.inited) return Promise.resolve();
    var shv = ss.get("uq-sh");
    var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch(e){}
    // il codice dell'invito: quello in memoria (accesso con il codice di 6 cifre) o, dopo il link dell'email, quello nei dati dell'account
    return rpc("viewer_init", { p_lang: S.lang, p_tz: tz || null, p_ref: refCode || null, p_ref_at: null,
      p_sh_kind: shv ? shv.k : null, p_sh_id: shv ? shv.id : null, p_sh_ch: shv ? shv.ch : null }).then(function(p){
      S.inited = true; S.profile = p; ss.set("uq-sh", null);
    }, function(){});
  }
  function login(opts){
    opts = opts || {};
    return new Promise(function(resolve){
      var email = "";
      function step1(msg){
        // testi del Legal (LEG-015, sezione D): 18 anni, condizioni d'uso, informativa; l'invito si vede e si può togliere
        var lq = "?lang=" + S.lang;
        var refHtml = refCode
          ? '<div class="uqg-ref" id="uqgRef">' + esc(T("refBox").replace("{code}", refCode)) + '<br><button type="button" class="uqg-link" id="uqgRefX">' + esc(T("refRemove")) + '</button></div>'
          : '<input type="text" id="uqgR" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="' + esc(T("refField")) + '" aria-label="' + esc(T("refField")) + '">';
        openModal('<h3>' + esc(opts.title || T("loginT")) + '</h3><p>' + esc(T("loginLead")) + '</p>'
          + '<form id="uqgF1"><input type="email" id="uqgE" autocomplete="email" inputmode="email" required placeholder="' + esc(T("emailPh")) + '" aria-label="' + esc(T("emailPh")) + '" value="' + esc(email) + '">'
          + refHtml
          + '<p class="uqg-err" id="uqgErr">' + esc(msg || "") + '</p><button class="uqg-btn dark" id="uqgGo">' + esc(T("sendCode")) + '</button></form>'
          + '<p class="uqg-small" style="margin-top:12px">' + esc(T("legal18")).replace("{terms}", '<a href="https://uniqaia.com/termini/' + lq + '" target="_blank" rel="noopener">' + esc(T("termsLink")) + '</a>')
          + ' <a href="https://uniqaia.com/privacy/' + lq + '" target="_blank" rel="noopener">' + esc(T("privacyLink")) + '</a></p>');
        var e = modal.querySelector("#uqgE"); setTimeout(function(){ e.focus(); }, 60);
        var rx = modal.querySelector("#uqgRefX"); if (rx) rx.addEventListener("click", function(){ dropRef(); email = (e.value || "").trim(); step1(); });
        modal.querySelector("#uqgF1").addEventListener("submit", function(ev){
          ev.preventDefault(); email = (e.value || "").trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { modal.querySelector("#uqgErr").textContent = T("errEmail"); return; }
          var ri = modal.querySelector("#uqgR"); if (ri && ri.value.trim()) { var rc = refOk(ri.value); if (rc) refCode = rc; }
          send(modal.querySelector("#uqgGo"));
        });
      }
      function send(btn){
        if (btn) btn.disabled = true;
        if (opts.pending) ss.set("uq-pending", opts.pending);   // se si entra dal link dell'email, l'azione riparte dopo il ritorno
        var back = location.origin + location.pathname + location.search;
        S.sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true, emailRedirectTo: back, data: refCode ? { source: "viewer", lang: S.lang, ref: refCode } : { source: "viewer", lang: S.lang } } }).then(function(r){
          if (r.error) { if (btn) btn.disabled = false; return step1(/rate|seconds|429/i.test(String(r.error.message) + r.error.status) ? T("errRate") : T("errGeneric")); }
          step2();
        });
      }
      function step2(msg){
        openModal('<h3>' + esc(opts.title || T("loginT")) + '</h3><p>' + esc(T("codeLead").replace("{e}", email)) + '</p>'
          + '<form id="uqgF2"><input class="code" id="uqgC" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="' + esc(T("codePh")) + '">'
          + '<p class="uqg-err" id="uqgErr">' + esc(msg || "") + '</p><button class="uqg-btn dark" id="uqgOk">' + esc(T("verify")) + '</button></form>'
          + '<button type="button" class="uqg-link" id="uqgRe">' + esc(T("resend")) + '</button> · <button type="button" class="uqg-link" id="uqgOther">' + esc(T("otherEmail")) + '</button>');
        var c = modal.querySelector("#uqgC"); setTimeout(function(){ c.focus(); }, 60);
        modal.querySelector("#uqgRe").addEventListener("click", function(){ send(null); });
        modal.querySelector("#uqgOther").addEventListener("click", function(){ step1(); });
        modal.querySelector("#uqgF2").addEventListener("submit", function(ev){
          ev.preventDefault(); var code = (c.value || "").replace(/\D/g, ""); if (code.length !== 6) { modal.querySelector("#uqgErr").textContent = T("errCode"); return; }
          var b = modal.querySelector("#uqgOk"); b.disabled = true;
          S.sb.auth.verifyOtp({ email: email, token: code, type: "email" }).then(function(r){
            if (r.error || !r.data || !r.data.session) { b.disabled = false; modal.querySelector("#uqgErr").textContent = T("errCode"); return; }
            S.user = r.data.session.user; ss.set("uq-pending", null);
            afterLogin().then(function(){ closeModal(); fire(); resolve(S.user); });
          });
        });
      }
      step1();
    });
  }
  var listeners = [];
  function fire(){ listeners.forEach(function(f){ try { f(S.user); } catch(e){} }); }

  // ---------------------------------------------------------------- Remind Me
  function bell(kind, id, opts){
    opts = opts || {}; addCss();
    var b = document.createElement("button"); b.type = "button"; b.className = "uqg-bell" + (opts.icon ? " icon" : ""); b.setAttribute("data-uqg-kind", kind); b.setAttribute("data-uqg-id", id);
    paint(b); b.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); toggle(kind, id, b); });
    return b;
  }
  function paint(b){
    var k = b.getAttribute("data-uqg-kind") + ":" + b.getAttribute("data-uqg-id"), on = !!S.mine[k], icon = b.classList.contains("icon");
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", on ? T("reminded") : T("remind")); b.title = on ? T("reminded") : T("remind");
    b.innerHTML = BELL + (icon ? "" : "<span>" + esc(on ? T("reminded") : T("remind")) + "</span>");
  }
  function repaint(){ Array.prototype.forEach.call(document.querySelectorAll("[data-uqg-kind]"), paint); Array.prototype.forEach.call(document.querySelectorAll("[data-uqg-count]"), paintCount); }
  function paintCount(el){ var n = S.counts[el.getAttribute("data-uqg-count")] || 0; el.hidden = n < 1; el.textContent = n === 1 ? T("interested1") : T("interestedN").replace("{n}", n); }
  function countEl(kind, id){ addCss(); var s = document.createElement("small"); s.className = "uqg-int"; s.setAttribute("data-uqg-count", kind + ":" + id); s.hidden = true; paintCount(s); return s; }
  function toggle(kind, id, btn){
    var k = kind + ":" + id, on = !S.mine[k];
    var go = function(){
      if (btn) btn.disabled = true;
      return rpc("save_life", { p_kind: kind, p_id: id, p_on: on, p_rem24: true, p_rem15: true }).then(function(r){
        S.mine[k] = on; S.counts[k] = r && r.n || 0; repaint();
        if (on) choices(kind, id); else toast(T("unsaved"));
      }, function(){ toast(T("unavailable")); }).then(function(){ if (btn) btn.disabled = false; });
    };
    if (S.user) return go();
    return login({ pending: { kind: kind, id: id } }).then(function(){ return load(kind, [id]).then(function(){ if (!S.mine[k]) return go(); repaint(); }); });
  }
  // «Remind Me»: le due caselle (LEG-015, sezione D). Già spuntate (Elena, 15/11); ogni tocco si salva subito.
  function choices(kind, id){
    var off = S.profile && S.profile.reminders === false;
    var m = openModal('<h3>' + esc(T("savedT")) + '</h3>'
      + '<label class="uqg-chk"><input type="checkbox" id="uqg24" checked> ' + esc(T("rem24")) + '</label>'
      + '<label class="uqg-chk"><input type="checkbox" id="uqg15" checked> ' + esc(T("rem15")) + '</label>'
      + '<p class="uqg-small" style="margin:8px 0 14px">' + esc(T("remNote")) + '</p>'
      + (off ? '<p class="uqg-small" style="margin:0 0 14px"><a href="/me/?lang=' + S.lang + '">' + esc(T("allOff")) + '</a></p>' : '')
      + '<button type="button" class="uqg-btn dark" id="uqgDone">' + esc(T("done")) + '</button>');
    var a = m.querySelector("#uqg24"), b = m.querySelector("#uqg15");
    function save(){ rpc("set_life_reminders", { p_kind: kind, p_id: id, p_rem24: a.checked, p_rem15: b.checked }).catch(function(){ toast(T("errGeneric")); }); }
    a.addEventListener("change", save); b.addEventListener("change", save);
    m.querySelector("#uqgDone").addEventListener("click", closeModal);
  }
  // numeri veri degli interessati e stato dei pulsanti, per un gruppo di dirette o serate
  function load(kind, ids){
    ids = (ids || []).filter(Boolean); if (!ids.length || !S.sb) return Promise.resolve();
    return S.ready.then(function(){ return rpc("interested", { p_kind: kind, p_ids: ids }); }).then(function(rows){
      (rows || []).forEach(function(r){ var k = kind + ":" + r.target_id; S.counts[k] = r.n; S.mine[k] = !!r.mine; }); repaint();
    }, function(){});
  }

  // ---------------------------------------------------------------- Share
  function withCh(url, ch){ return url + (url.indexOf("?") >= 0 ? "&" : "?") + "sh=" + ch; }
  // testo con il link dentro ({link}, per esempio il messaggio d'invito del Legal) oppure testo e link in fondo
  function msgFor(o, ch){ var u = withCh(o.url, ch); return o.text && o.text.indexOf("{link}") >= 0 ? o.text.replace("{link}", u) : (o.text || o.title || "") + " " + u; }
  function natData(o){ return o.text && o.text.indexOf("{link}") >= 0 ? { title: o.title, text: msgFor(o, "native") } : { title: o.title, text: o.text || o.title, url: withCh(o.url, "native") }; }
  function record(kind, id, ch){ if (S.sb) rpc("record_share", { p_kind: kind, p_id: id || null, p_channel: ch }).catch(function(){}); }
  function share(o){
    // o: { kind, id, url, title, text }
    var touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    if (navigator.share && touch) {
      return navigator.share(natData(o)).then(function(){ record(o.kind, o.id, "native"); }, function(e){ if (!e || e.name !== "AbortError") sheet(o); });
    }
    sheet(o);
  }
  function sheet(o){
    var ch = [
      ["wa", "WhatsApp", "W", "https://wa.me/?text=" + encodeURIComponent(msgFor(o, "wa"))],
      ["fb", "Facebook", "f", "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(withCh(o.url, "fb"))],
      ["tg", "Telegram", "T", "https://t.me/share/url?url=" + encodeURIComponent(withCh(o.url, "tg")) + "&text=" + encodeURIComponent(o.title || "")],
      ["rd", "Reddit", "R", "https://www.reddit.com/submit?url=" + encodeURIComponent(withCh(o.url, "rd")) + "&title=" + encodeURIComponent(o.title || "")],
      ["em", T("email"), "@", "mailto:?subject=" + encodeURIComponent(o.title || "Uniqaia") + "&body=" + encodeURIComponent(msgFor(o, "em"))],
      ["copy", T("copy"), "⧉", ""]
    ];
    var m = openModal('<h3>' + esc(T("shareT")) + '</h3><p dir="auto">' + esc(o.text && o.text.indexOf("{link}") >= 0 ? o.text.replace("{link}", o.url) : (o.title || "")) + '</p><div class="uqg-grid">'
      + ch.map(function(c){ return c[3] ? '<a class="uqg-ch" data-ch="' + c[0] + '" href="' + esc(c[3]) + '" target="_blank" rel="noopener"><i>' + esc(c[2]) + '</i>' + esc(c[1]) + '</a>' : '<button type="button" class="uqg-ch" data-ch="' + c[0] + '"><i>' + esc(c[2]) + '</i>' + esc(c[1]) + '</button>'; }).join("")
      + '</div>' + (navigator.share ? '<button type="button" class="uqg-btn" id="uqgNat">' + SHARE + esc(T("more")) + '</button>' : '') + '<p class="uqg-small" style="margin-top:12px">' + esc(T("igNote")) + '</p>');
    Array.prototype.forEach.call(m.querySelectorAll("[data-ch]"), function(a){
      a.addEventListener("click", function(ev){
        var c = a.getAttribute("data-ch");
        if (c === "copy") {
          ev.preventDefault(); var u = withCh(o.url, "copy");
          var ok = function(){ record(o.kind, o.id, "copy"); toast(T("copied")); closeModal(); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(ok, function(){ prompt(T("copy"), u); ok(); }); else { prompt(T("copy"), u); ok(); }
          return;
        }
        record(o.kind, o.id, c); setTimeout(closeModal, 300);
      });
    });
    var n = m.querySelector("#uqgNat"); if (n) n.addEventListener("click", function(){ navigator.share(natData(o)).then(function(){ record(o.kind, o.id, "native"); closeModal(); }, function(){}); });
  }
  function shareBtn(o, cls){ addCss(); var b = document.createElement("button"); b.type = "button"; b.className = cls || "uqg-bell"; b.innerHTML = SHARE + "<span>" + esc(T("share")) + "</span>"; b.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); share(typeof o === "function" ? o() : o); }); return b; }
  // clic arrivato da un link condiviso: si conta una volta per pagina, con il tipo e l'id che la pagina conosce
  function visit(kind, id){
    var ch = ss.get("uq-sh-pending"); if (!ch || !S.sb) return; ss.set("uq-sh-pending", null);
    ss.set("uq-sh", { k: kind, id: id || null, ch: ch });   // per contare la registrazione, se avviene in questa visita
    rpc("record_visit", { p_kind: kind, p_id: id || null, p_channel: ch }).catch(function(){});
  }

  window.UQG = {
    init: function(sb, opts){
      opts = opts || {}; S.sb = sb; S.lang = GT[opts.lang] ? opts.lang : "en"; S.base = opts.base || ""; addCss();
      S.ready = sb.auth.getSession().then(function(r){ var s = r && r.data && r.data.session; S.user = s ? s.user : null; return S.user ? afterLogin() : null; }).catch(function(){});
      sb.auth.onAuthStateChange(function(ev, sess){
        var u = sess ? sess.user : null, was = S.user; S.user = u;
        if (ev === "SIGNED_IN" && u && !was) afterLogin().then(function(){
          var p = ss.get("uq-pending"); ss.set("uq-pending", null);
          if (p) load(p.kind, [p.id]).then(function(){ if (!S.mine[p.kind + ":" + p.id]) toggle(p.kind, p.id, null); });
          fire();
        });
        if (ev === "SIGNED_OUT") { S.inited = false; S.mine = {}; repaint(); fire(); }
      });
      return S.ready;
    },
    setLang: function(l){ if (GT[l]) { S.lang = l; repaint(); } },
    t: T, texts: GT, user: function(){ return S.user; }, profile: function(){ return S.profile; }, onAuth: function(f){ listeners.push(f); },
    login: login, bell: bell, ref: function(){ return refCode; }, count: countEl, load: load, toggle: toggle, share: share, shareBtn: shareBtn, visit: visit, toast: toast,
    rpc: function(fn, a){ return rpc(fn, a); }, signOut: function(){ return S.sb.auth.signOut(); }, refreshProfile: function(){ S.inited = false; return afterLogin(); },
    icons: { bell: BELL, share: SHARE, user: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>' }
  };
})();
