// don't let idle HTTP Keep-Alive connections prevent server.close()
// <https://github.com/nodejs/node-v0.x-archive/issues/9066>:

"use strict";

module.exports = function getGracefulClose(server) {
    var isServerListening = false, sockets = new Map(), ids = [];

    server.on("listening", () => {
        isServerListening = true; // Node 5+: remove, can use "server.listening"
    });

    server.on("connection", (socket) => {

        ids.push(socket);
        console.log(`socket#${ids.indexOf(socket)} opened`);

        sockets.set(socket, false);
        socket.on("close", () => {
            console.log(`socket#${ids.indexOf(socket)} closed`);
            sockets.delete(socket);
        });
    });

    server.on("request", (req, res) => {
        var socket = req.connection;
        console.log(`socket#${ids.indexOf(socket)}: request started`);
        sockets.set(socket, true);

        res.on("finish", () => {
            console.log(`socket#${ids.indexOf(socket)}: request finished`);
            sockets.set(socket, false);
            if (!isServerListening) { // Node 5+: use "server.listening"
                console.log(`socket#${ids.indexOf(socket)}: ...destroying because server is closing`);
                socket.end();
                socket.destroy(); // helps Varnish: http://bit.ly/1TQxTRQ
                // let socket "close" event handler remove it from sockets
            }
        });
    });

    return function gracefulClose(options, cb) {
        var failsafeClose, didForceClose = false;

        console.log(`gracefulClose: gracefulClose() invoked`);

        // normalize arguments:
        if (arguments.length === 1 && typeof arguments[0] === "function") {
            options = void 0;
            cb = arguments[0];
        }
        if (typeof options === "number") {
            options = { timeout: options };
        } else if (!options) {
            options = {};
        }
        if (options.timeout == null) {
            options.timeout = 5000;
        }
        cb = cb || () => {};

        // close server to new connections:
        server.close(() => {
            console.log(`gracefulClose: server.close() callback, all cleaned up! (didForceClose=${didForceClose})`);
            clearTimeout(failsafeClose);
            cb(didForceClose);
        });
        isServerListening = false; // Node 5+: remove, can use "server.listening"

        // close idle connections:
        sockets.forEach((isActive, socket) => {
            if (!isActive) {
                console.log(`gracefulClose: destroying idle socket#${ids.indexOf(socket)}`);
                socket.end();
                socket.destroy(); // helps Varnish: http://bit.ly/1TQxTRQ
                // let socket "close" event handler remove it from sockets
            }
        });

        // exit in 5 seconds in case server.close never returns:
        failsafeClose = setTimeout(() => {
            console.log(`gracefulClose: connections still open after timeout, destroying active sockets`)
            didForceClose = true;
            sockets.forEach((isActive, socket) => {
                console.log(`gracefulClose: destroying active (isActive=${isActive}) socket#${ids.indexOf(socket)}`);
                // should only be active sockets at this point
                socket.end();
                socket.destroy(); // helps Varnish: http://bit.ly/1TQxTRQ
                // let socket "close" event handler remove it from sockets
            });
            // let server.close callback call cb()
        }, options.timeout);
    };
};
