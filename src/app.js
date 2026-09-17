import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import {
  messageRouter,
  publicMessageRouter,
} from "./modules/messages/message.routes.js";
import {
  shipmentRouter,
  trackingRouter,
} from "./modules/shipments/shipment.routes.js";
import { errorHandler, notFoundHandler } from "./shared/errorHandler.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // les limiteurs de débit ont besoin de la vraie IP client derrière un proxy
  app.use(helmet());
  app.use(
    cors({
      origin: env.clientOrigin.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (!env.isProd) app.use(morgan("dev"));

  app.get("/api/health", (_req, res) => {
    res.json({
      success: true,
      service: "safeposte-api",
      uptime: process.uptime(),
    });
  });

  // Public
  app.use("/api/tracking", trackingRouter);
  app.use("/api/contact", publicMessageRouter);

  // Agence (protégé par JWT)
  app.use("/api/auth", authRouter);
  app.use("/api/shipments", shipmentRouter);
  app.use("/api/messages", messageRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
