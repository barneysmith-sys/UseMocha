// /api/callback.js
// Handles Google OAuth redirect from Supabase.
// Step 1: Supabase sends the browser here with #access_token in the URL hash.
//         Servers cannot read URL hashes, so we serve a tiny page that reads
//         the hash client-side and posts the token back as query params.
// Step 2: The page POSTs back to /api/callback?at=...&rt=...
//         We validate the token, then redirect to /app?at=...&uid=...

export default async function handler(req, res) {
  const at = req.query.at;
  const rt = req.query.rt;

  // ── Step 2: token arrived as query params ────────────────────────
  if (at) {
    const SB_URL = 'https://xfwsnshhlfjzflobuoxd.supabase.co';
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmd3Nuc2hobGZqemZsb2J1b3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODg2NDUsImV4cCI6MjA5NDI2NDY0NX0.gZnNb3EEEy9H3ZZ-B-1lSSSbbldJkIuS0zcFmT6Wjec';

    try {
      const r = await fetch(`${SB_URL}/auth/v1/user`, {
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${at}`
        }
      });
      const user = await r.json();
      if (user && user.id) {
        // ✅ Valid token — redirect to the product app page
        return res.redirect(
          `/app?at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt || '')}&uid=${encodeURIComponent(user.id)}`
        );
      }
    } catch (e) {
      console.error('[callback] token validation error:', e);
    }
    // Token invalid
    return res.redirect('/?auth_error=invalid_token');
  }

  // ── Step 1: Supabase landed here with #access_token in hash ─────
  // Serve a tiny HTML page that reads the hash and posts back as query params
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <title>Signing in to Mocha...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; font-family: 'DM Sans', system-ui, sans-serif;
           background: #f5ede0; color: #0f1a14; }
    .wrap { text-align: center; }
    .logo { width: 44px; height: 44px; background: #0f1a14; border-radius: 10px;
            display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
    .logo span { color: #f5ede0; font-size: 20px; font-weight: 700; font-family: serif; }
    p { font-size: 15px; color: #0a5c44; font-weight: 500; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo"><span>m</span></div>
    <p>Signing you in...</p>
  </div>
  <script>
    var hash = window.location.hash;
    if (hash && hash.indexOf('access_token=') !== -1) {
      var params = {};
      hash.replace(/^#/, '').split('&').forEach(function(p) {
        var kv = p.split('=');
        if (kv.length >= 2) {
          params[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join('='));
        }
      });
      if (params.access_token) {
        window.location.href = '/api/callback?at=' +
          encodeURIComponent(params.access_token) +
          '&rt=' + encodeURIComponent(params.refresh_token || '');
      } else {
        window.location.href = '/?auth_error=no_token';
      }
    } else {
      window.location.href = '/?auth_error=no_hash';
    }
  </script>
</body>
</html>`);
}
