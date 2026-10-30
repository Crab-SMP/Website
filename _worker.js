var JOIN_URL = 'https://play.crabsmp.net:19132/v1/join';

function serverStatus() {
  var headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  return fetch(JOIN_URL).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.text();
  }).then(function (body) {
    headers['Content-Type'] = 'application/json';
    return new Response(body, { headers: headers });
  }).catch(function () {
    return new Response(null, { status: 502, headers: headers });
  });
}

export default {
  fetch: function (request, env) {
    if (new URL(request.url).pathname === '/api/status') return serverStatus();
    return env.ASSETS.fetch(request);
  }
};
