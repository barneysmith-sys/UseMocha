export default async function handler(req, res) {
  const at = req.query.at;
  const rt = req.query.rt || '';

  if (at) {
    // Redirect to landing with token as query param
    return res.redirect(302, `/?at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt)}`);
  }

  // Serve a page that reads the hash - using no inline JS (CSP safe)
  // Instead we use a form POST trick or just show the URL in a way the user clicks
  // Actually: set Content-Security-Policy to allow inline scripts for this specific response
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "script-src 'unsafe-inline'");
  res.status(200).send(`<!DOCTYPE html>
<html><head><title>Signing in...</title>
<style>html,body{margin:0;height:100%;background:#0a1810;display:flex;align-items:center;justify-content:center}p{color:#4dc994;font-family:system-ui;font-size:16px}</style>
</head><body><p>Signing you in...</p>
<script>
(function(){
  var h=window.location.hash.slice(1);
  var p={};
  h.split('&').forEach(function(s){var i=s.indexOf('=');if(i>0)p[s.slice(0,i)]=decodeURIComponent(s.slice(i+1).replace(/\+/g,' '));});
  if(p.access_token){
    window.location.replace('/api/callback?at='+encodeURIComponent(p.access_token)+'&rt='+encodeURIComponent(p.refresh_token||''));
  } else {
    window.location.replace('/?auth_error=no_token');
  }
})();
</script></body></html>`);
}
