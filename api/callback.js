// ═══════════════════════════════════════════════════════════════════
// Mocha — /api/callback
// Handles OAuth redirects from Supabase.
// Two paths: query-param tokens (server redirect) + hash tokens (client JS).
// ═══════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // Path A — Supabase passed tokens as query params (some OAuth flows)
  const at = req.query.at;
  const rt = req.query.rt || '';
  if (at) {
    return res.redirect(302, `/app?at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt)}`);
  }

  // Path B — Tokens are in the URL hash (client-only, not visible server-side).
  // Serve a minimal page that extracts the hash and redirects to /app.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  html, body { margin: 0; background: #fef7f0; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, sans-serif; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #0a5c44; animation: p 1s ease-in-out infinite; display: inline-block; margin: 0 3px; }
  .dot:nth-child(2) { animation-delay: .15s; }
  .dot:nth-child(3) { animation-delay: .3s; }
  @keyframes p { 0%,100% { opacity: 1; transform: translateY(0); } 50% { opacity: .3; transform: translateY(-6px); } }
</style>
</head>
<body>
<div><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
<script>
(function() {
  var h = location.hash.slice(1);
  var p = {};
  h.split('&').forEach(function(s) {
    var i = s.indexOf('=');
    if (i > 0) p[s.slice(0, i)] = decodeURIComponent(s.slice(i + 1));
  });
  if (p.access_token) {
    location.replace('/app?at=' + encodeURIComponent(p.access_token) + '&rt=' + encodeURIComponent(p.refresh_token || ''));
  } else if (p.error) {
    location.replace('/app?auth_error=' + encodeURIComponent(p.error_description || p.error));
  } else {
    location.replace('/app?auth_error=no_token');
  }
})();
</script>
</body>
</html>`);
}
