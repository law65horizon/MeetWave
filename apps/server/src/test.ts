const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const config = require("./config");
const { runWorkers } = require("./mediasoup/workerManager");
const socketHandlers = require("./socket/handlers"); 
const jwt = require("jsonwebtoken");

const admin = require('./firebase')


const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.static("public"));


const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

(async () => {
  try {
    await runWorkers();

    io.use(async(socket, next) => {
      const token = socket.handshake.auth?.token

      // console.log({token})

      if (!token) {
        next()
      } 

      try {
        const decodedToken = await admin.auth().verifyIdToken(token)

        // console.log({decodedToken})
        socket.user = {...decodedToken}
        next()
      } catch (error) {
        next()
      }
    })
    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);
      socketHandlers(socket);
    });
  
    server.listen(config.port, () => {
      console.log(`Server listening on port ${config.port} [env:${config.nodeEnv}]`);
    });
  } catch (error) {
    console.log('startup failed', error)
    process.exit(1)
  }
})();