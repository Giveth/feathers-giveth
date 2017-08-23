import socketio from 'feathers-socketio';
import { getUser } from './middleware/authenticate';

export default socketio(io => {

  io.on('connection', socket => {

    socket.on('authenticate', (data, cb) => {
      if (!data.signature) return;

      const user = getUser(data.signature);

      if (user) {
        Object.assign(socket.feathers, { authenticated: true, user });
        cb(true);
      }
      cb(false);
    });
  });

});
