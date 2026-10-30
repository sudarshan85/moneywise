# Future Work

Ideas that are not implemented yet. Each one is a short note; design it properly
when it's picked up.

## Manual category ordering

Drag and drop category cards on the dashboard to set their order, with a toggle
between automatic ordering (today's tiers) and manual ordering. This needs:
- a nullable `categories.dashboard_sort_order` column;
- a `dashboard_ordering` setting;
- a reorder endpoint.

## Mobile layout and PWA

Make the Dashboard and Transactions pages usable on a phone, and make the app
installable to the home screen. This needs:
- a `manifest.json` and the PWA meta tags in `index.html`;
- a bottom tab bar under 768px;
- tables that scroll sideways;
- stacked filters and forms;
- touch targets of at least 44px.

Offline support isn't needed.
