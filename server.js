import https from "https";
import fs from "fs";
import path from "path";
import next from "next";

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
