export default async function handler(req, res) {
  const at = req.query.at;
  const allParams = JSON.stringify(req.query);

  // Log what we received
  console.log('[callback] called with params:', allParams);

  if (at) {
    console.log('[callback] has ?at=, redirecting to /?at=...');
    return res.redirect(
      `/?at=${encodeURIComponent(at)}&rt=${encodeURIComponent(req.query.rt || '')}`
    );
  }

  // No ?at= — Step 1: serve hash-reader page
  console.log('[callback] no ?at=, serving hash-reader');
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html>
<head><title>Signing in...</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100%;background:#fef7f0;display:flex;align-items:center;justify-content:center;font-family:system-ui}
  .logo{width:48px;height:48px;background:#1a2e1e;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
  .logo span{color:#fde8cc;font-size:22px;font-family:Georgia,serif;font-style:italic}
  p{font-size:15px;color:#2d7a52;font-weight:500;margin-top:8px;text-align:center}
</style>
</head>
<body>
<div>
  <div class="logo"><span>m</span></div>
  <p>Signing you in...</p>
</div>
<script>
  console.log('[callback-page] hash:', window.location.hash.slice(0,80));
  var hash = window.location.hash;
  if (hash && hash.indexOf('access_token=') !== -1) {
    var params = {};
    hash.replace(/^#/,'').split('&').forEach(function(p){
      var kv = p.split('=');
      if(kv.length>=2) params[decodeURIComponent(kv[0])]=decodeURIComponent(kv.slice(1).join('='));
    });
    if (params.access_token) {
      console.log('[callback-page] found token, posting to /api/callback');
      window.location.href = '/api/callback?at=' +
        encodeURIComponent(params.access_token) +
        '&rt=' + encodeURIComponent(params.refresh_token || '');
    } else {
      console.warn('[callback-page] no access_token in params');
      window.location.href = '/?auth_error=no_token';
    }
  } else {
    console.warn('[callback-page] no hash or no access_token. hash was:', hash.slice(0,100));
    window.location.href = '/?auth_error=no_hash&debug=' + encodeURIComponent(hash.slice(0,100));
  }
</script>
</body>
</html>`);
}
