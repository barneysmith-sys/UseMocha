export default async function handler(req, res) {
  const at = req.query.at;

  if (at) {
    // Got the token — save it via a redirect to landing with ?at=
    return res.redirect(302,
      `/?at=${encodeURIComponent(at)}&rt=${encodeURIComponent(req.query.rt || '')}`
    );
  }

  // No token yet — serve page that reads hash and sends it back
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html><head><title>Signing in to Mocha...</title>
<style>
html,body{margin:0;height:100%;background:#0a1810;display:flex;align-items:center;justify-content:center;font-family:system-ui}
p{color:#4dc994;font-size:16px;font-weight:500}
</style>
</head>
<body><p>Signing you in...</p>
<script>
(function() {
  var h = window.location.hash;
  if (!h) { window.location.href = '/?auth_error=no_hash'; return; }
  var p = {};
  h.slice(1).split('&').forEach(function(s) {
    var i = s.indexOf('=');
    if (i > 0) p[s.slice(0,i)] = decodeURIComponent(s.slice(i+1).replace(/\\+/g,' '));
  });
  if (!p.access_token) { window.location.href = '/?auth_error=no_token'; return; }
  window.location.href = '/api/callback?at=' + encodeURIComponent(p.access_token) + '&rt=' + encodeURIComponent(p.refresh_token||'');
})();
</script>
</body></html>`);
}
