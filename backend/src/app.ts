import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { config } from "./config";
import gameController from "./controllers/gameController";
import { AIResponseValidationError } from "./services/aiService";
import { JsonParseError } from "./utils/jsonParser";

const app = express();

app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
  }),
);

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/game", gameController);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    if (err instanceof JsonParseError) {
      res.status(502).json({ error: "AI returned invalid JSON" });
      return;
    }

    if (err instanceof AIResponseValidationError) {
      res.status(502).json({ error: "AI response failed validation" });
      return;
    }

    if (err instanceof ZodError) {
      res.status(400).json({ error: "Validation error", issues: err.issues });
      return;
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Internal server error", message });
  },
);

export default app;
