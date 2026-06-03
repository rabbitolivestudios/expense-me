import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { agentMailRouter } from "./routes/agentmail";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors({ origin: "http://127.0.0.1:5173" }));
app.use(express.json({ limit: "10mb" }));
app.use("/api/agentmail", agentMailRouter);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "expense-me-api" });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Expense Me API listening on http://127.0.0.1:${port}`);
});
