-- 7/11/2026: Elena ha tolto dalla home la sezione «Gioiellerie e gem dealer», con il link «Come entrare».
-- Quel link aveva id="joinLink", e il controllo sito.home lo cerca nell'HTML della home.
-- Per non far scattare un falso allarme, id="joinLink" ora sta sul pulsante «Candidati» del box
-- «Vendi in diretta su Uniqaia», che porta allo stesso posto (/join). Il controllo continua a funzionare.
-- Da applicare quando si puo' scrivere nel database (NON ancora applicato): il controllo cerca anche
-- «Trasmetti con noi», che sta nel menu.
update ops.checks
   set config = jsonb_set(config, '{expect_text}', '["id=\"tabs\"", "id=\"tabJoin\""]'::jsonb)
 where id = 'sito.home';
