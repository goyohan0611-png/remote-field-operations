const net = require('net');

// IPv4만 받는 카메라 제어 프로그램에 터널 IPv6 주소를 직접 전달하지 않는다.
function createCameraProxy(host, port) {
  return new Promise((resolve, reject) => {
    const sockets = new Set();
    const server = net.createServer((client) => {
      sockets.add(client);
      const upstream = net.connect({ host, port });
      sockets.add(upstream);
      upstream.setTimeout(10000, () => upstream.destroy());
      upstream.once('connect', () => upstream.setTimeout(0));
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.on('close', () => { sockets.delete(client); upstream.destroy(); });
      upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
      client.pipe(upstream).pipe(client);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve({
        host: '127.0.0.1',
        port: server.address().port,
        close() {
          for (const socket of sockets) socket.destroy();
          server.close();
        },
      });
    });
  });
}

module.exports = { createCameraProxy };
