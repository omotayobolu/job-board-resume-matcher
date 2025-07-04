require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const db = require("./db");
const errorMiddleware = require("./middlewares/errorHandlerMiddleware");
const { errorHandler } = require("./utils/error-handler");

const googleRouter = require("./routes/google");
const oauthRouter = require("./routes/oauth");
const router = require("./routes/routes");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(cookieParser());
app.use(morgan("dev"));

app.use(router);
// app.get("/", async (req, res, next) => {
//   try {
//     const result = await db.query("SELECT * FROM users");
//     res.json(result);
//     console.log(result);
//   } catch (error) {
//     next(error);
//   }
// });

app.use("/auth/google/callback", googleRouter);
app.use("/auth/google/callback", oauthRouter);

app.use(errorMiddleware);

process.on("uncaughtException", (error) => {
  try {
    errorHandler.handleError(error);
  } catch (e) {
    console.error("Failed to handle error", e);
  } finally {
    if (!errorHandler.isTrustedError(error)) {
      process.exit(1);
    }
  }
});

process.on("unhandledRejection", (reason, promise) => {
  throw reason;
});

app.listen(3000, () => {
  console.log("Server is running on port 3000...");
});
