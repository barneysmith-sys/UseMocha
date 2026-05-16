export default async function handler(req, res) {
  // Supabase sends tokens in the URL hash which servers can't read.
  // So we serve a tiny HTML page that reads the hash client-side
  // and posts it to us, then we redirect with clean query params.
  
  const at = req.query.at;
  const rt = req.query.rt;

  // Step 2: frontend posted the token to us as query params
  if (at) {
    const SB_URL = 'https://xfwsnshhlfjzflobuoxd.supabase.co';
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmd3Nuc2hobGZqemZsb2J1b3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODg2NDUsImV4cCI6MjA5NDI2NDY0NX0.gZnNb3EEEy9H3ZZ-B-1lSSSbbldJkIuS0zcFmT6Wjec';
    
    try {
      const r = await fetch(`${SB_URL}/auth/v1/user`, {
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${at}` }
      });
      const user = await r.json();
      if (user && user.id) {
        return res.redirect(`/?at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt||'')}&uid=${encodeURIComponent(user.id)}`);
      }
    } catch(e) {}
    return res.redirect('/?auth_error=invalid_token');
  }

  // Step 1: Supabase redirected here with #access_token in hash.
  // Serve HTML that extracts hash and redirects to this same endpoint with query params.
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html>
<head><title>Signing in...</title></head>
<body>
<script>
  var hash = window.location.hash;
  if (hash && hash.indexOf('access_token=') !== -1) {
    var params = {};
    hash.replace(/^#/,'').split('&').forEach(function(p){
      var kv = p.split('=');
      if(kv.length>=2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join('='));
    });
    if (params.access_token) {
      window.location.href = '/api/callback?at=' + encodeURIComponent(params.access_token) + '&rt=' + encodeURIComponent(params.refresh_token||'');
    } else {
      window.location.href = '/?auth_error=no_token';
    }
  } else {
    window.location.href = '/?auth_error=no_hash';
  }
</script>
<p>Completing sign in...</p>
</body>
</html>`);
}
