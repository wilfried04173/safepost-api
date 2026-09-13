import { createApp } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";

async function start() {
  try {
    await connectDatabase();
    const app = createApp();
    const server = app.listen(env.port, () => {
      console.log(
        `[api] SafePost API running on http://localhost:${env.port} (${env.nodeEnv})`,
      );
    });

    const shutdown = (signal) => {
      console.log(`\n[api] ${signal} received, shutting down`);
      server.close(() => process.exit(0));
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("[api] failed to start:", error.message);
    process.exit(1);
  }
}

start();
