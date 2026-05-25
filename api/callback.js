export default async function handler(req, res) {
  const at = req.query.at;
  const rt = req.query.rt || '';

  if (at) {
    return res.redirect(302, `/?at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt)}`);
  }

  // Instantly read hash and redirect — user sees nothing, loading happens in app.html
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");
  res.status(200).send(`<!DOCTYPE html><html><head>
<script>
var h=location.hash.slice(1),p={};
h.split('&').forEach(function(s){var i=s.indexOf('=');if(i>0)p[s.slice(0,i)]=decodeURIComponent(s.slice(i+1));});
if(p.access_token){location.replace('/?at='+encodeURIComponent(p.access_token)+'&rt='+encodeURIComponent(p.refresh_token||''));}
else{location.replace('/?auth_error=no_token');}
</script>
<style>html,body{margin:0;background:#fef7f0}</style>
</head><body></body></html>`);
}
