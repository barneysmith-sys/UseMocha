// /api/callback.js
// Supabase OAuth sends tokens in the URL hash (#access_token=...).
// Servers can't read hashes. This page extracts the hash client-side
// and lets the Supabase JS SDK handle it automatically on /app.

export default async function handler(req, res) {
  // If query params arrive (old flow), just redirect to /app with them
  // so the SDK can pick them up
  const at = req.query.at;
  if (at) {
    // Validate and redirect to /app — SDK will pick up from storage
    const SB_URL = 'https://xfwsnshhlfjzflobuoxd.supabase.co';
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmd3Nuc2hobGZqemZsb2J1b3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODg2NDUsImV4cCI6MjA5NDI2NDY0NX0.gZnNb3EEEy9H3ZZ-B-1lSSSbbldJkIuS0zcFmT6Wjec';
    try {
      const r = await fetch(`${SB_URL}/auth/v1/user`, {
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${at}` }
      });
      const user = await r.json();
      if (user && user.id) {
        return res.redirect(`/app?at=${encodeURIComponent(at)}&rt=${encodeURIComponent(req.query.rt || '')}&uid=${encodeURIComponent(user.id)}`);
      }
    } catch(e) {}
    return res.redirect('/?auth_error=invalid_token');
  }

  // Step 1: Supabase redirected here with #access_token in the hash.
  // Serve a page that reads the hash and posts back here as query params.
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <title>Signing in to Mocha...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{height:100%;background:#fef7f0;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',system-ui,sans-serif}
    .wrap{text-align:center;padding:24px}
    .logo{width:48px;height:48px;background:#1a2e1e;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
    .logo span{color:#fde8cc;font-size:22px;font-family:Georgia,serif;font-style:italic}
    p{font-size:15px;color:#2d7a52;font-weight:500;margin-top:8px}
    .bar{width:140px;height:3px;background:#e8d5c4;border-radius:99px;margin:16px auto 0;overflow:hidden}
    .fill{height:100%;width:0;background:linear-gradient(90deg,#0a5c44,#4dc994);border-radius:99px;animation:fill 1.8s ease forwards}
    @keyframes fill{0%{width:0}60%{width:75%}100%{width:95%}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo"><span>m</span></div>
    <p>Signing you in...</p>
    <div class="bar"><div class="fill"></div></div>
  </div>
  <script>
    var hash = window.location.hash;
    if (hash && hash.indexOf('access_token=') !== -1) {
      var params = {};
      hash.replace(/^#/,'').split('&').forEach(function(p){
        var kv = p.split('=');
        if(kv.length>=2) params[decodeURIComponent(kv[0])]=decodeURIComponent(kv.slice(1).join('='));
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
