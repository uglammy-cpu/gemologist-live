# Brand files

One JSON file per brand. The file name is the brand slug used everywhere:
`<script src="https://live.gemsandjewelrytechlab.com/widget.js" data-brand="SLUG" defer></script>`

Fields:
- `lang`: "en" or "it"
- `inbox`: identifier of the brand's Chatwoot **API** inbox (Settings → Inboxes → the inbox → Configuration)
- `name`: brand name (shown if there is no logo)
- `logo`: full https link to the brand logo (PNG/SVG, transparent background, about 300×80)
- `header`: colour of the chat header, e.g. "#16181D" (empty = gold)
- `bubble`: colour of the customer's messages (empty = black)
- `accent`: colour of buttons (empty = gold)
- `page`: optional path for a stand-alone chat page (for Instagram bio, WhatsApp and the warranty QR), e.g. "rossi" → live.gemsandjewelrytechlab.com/rossi/
- `title`, `description`, `og`: link preview for that page

After adding or changing a brand: `python3 build.py`, then commit and push.
