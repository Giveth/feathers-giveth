const socketio = require('@feathersjs/socketio');

module.exports = socketio(io => {
  io.use((socket, next) => {
    // Exposing a request property to services and hooks
    // socket.feathers.handshake = socket.handshake;
    // socket.feathers.userAgent = socket.headers['user-agent'];
    // socket.feathers.origin = socket.headers.origin;
    // socket.feathers.referrer = socket.request.referrer;
    // console.log('socket connection', {
    //   x1: socket.headers['user-agent'],
    //   x2: socket.headers.origin,
    //   x3: socket.request.referrer,
    // });
    // console.log('socket connection', socket);
    next();
  });
});
