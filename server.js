/* eslint-disable @typescript-eslint/no-require-imports */

const https = require("https");
const fs = require("fs");
const path = require("path");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const certPath = (filename) => path.join(process.cwd(), filename);

app.prepare().then(() => {
  https
    .createServer(
      {
        key: fs.readFileSync(certPath("localhost-key.pem")),
        cert: fs.readFileSync(certPath("localhost.pem")),
      },
      (req, res) => {
        handle(req, res);
      }
    )
    .listen(3000, (err) => {
      if (err) throw err;
      console.log("🚀 HTTPS Dev Server ready: https://localhost:3000");
    });
});
