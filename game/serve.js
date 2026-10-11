// 간단한 정적 서버: node serve.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const port = +process.argv[2] || 8080;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.png':'image/png', '.xml':'text/xml', '.json':'application/json', '.ttf':'font/ttf', '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.ogg':'audio/ogg' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(__dirname, p);
  if (!f.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
}).listen(port, () => console.log('Footival: http://localhost:' + port));
