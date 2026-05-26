// ═══════════════════════════════════════════════════════════════════
// Mocha — /api/callback  (ORIGINAL — do not change redirect targets)
// Supabase OAuth sends tokens in the URL hash after redirect.
// This page extracts the hash client-side and forwards to /app.
// DO NOT redirect to /app directly — _appBoot reads the hash, not query params.
// ═══════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // Path A — tokens already in query params (rare Supabase flow)
  const at = req.query.at;
  const rt = req.query.rt || '';
  if (at) {
    // Forward to / so _appBoot can find them via window.location.search
    return res.redirect(302, `/?at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt)}`);
  }

  // Path B — tokens are in the URL hash (#access_token=...).
  // Server can't see the hash — serve a minimal page that reads it and
  // forwards to / preserving the full hash so _appBoot picks it up.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");
  res.status(200).send(`<!DOCTYPE html><html><head>
<style>html,body{margin:0;background:#fef7f0}</style>
<script>
var h=location.hash.slice(1),p={};
h.split('&').forEach(function(s){var i=s.indexOf('=');if(i>0)p[s.slice(0,i)]=decodeURIComponent(s.slice(i+1));});
if(p.access_token){location.replace('/?at='+encodeURIComponent(p.access_token)+'&rt='+encodeURIComponent(p.refresh_token||''));}
else{location.replace('/?auth_error=no_token');}
</script>
</head><body></body></html>`);
}
