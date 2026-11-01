import "dotenv/config";
import express from "express";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";
import errorMiddleware from "./middlewares/errorHandlerMiddleware";
import { errorHandler } from "./utils/error-handler";

import router from "./routes/routes";
import { requiredEnv } from "./env";
import { resumeQueue } from "./utils/resumeQueue";

const app = express();
app.disable("etag");

app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: requiredEnv("FRONTEND_URL"),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(cookieParser());
app.use(morgan("dev"));

app.use(router);

app.use(errorMiddleware);

const port = process.env.PORT || 3000;
let server: ReturnType<typeof app.listen> | undefined;
void resumeQueue.start().then(() => {
  server = app.listen(port, () => {
    console.log(`Server is running on port ${port}...`);
  });
  server.on("error", shutDownAfterFatalError);
}).catch(shutDownAfterFatalError);

let shuttingDown = false;
function shutDownAfterFatalError(error: unknown) {
  try {
    errorHandler.handleError(error);
  } catch (e) {
    console.error("Failed to handle error", e);
  }

  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = 1;

  const timeout = setTimeout(() => process.exit(1), 10000);
  if (server) {
    server.close(() => {
      clearTimeout(timeout);
      process.exit(1);
    });
  } else {
    clearTimeout(timeout);
    process.exit(1);
  }
}

process.on("uncaughtException", shutDownAfterFatalError);

process.on("unhandledRejection", (reason) => {
  shutDownAfterFatalError(
    reason instanceof Error ? reason : new Error(String(reason))
  );
});
