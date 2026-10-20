import "dotenv/config";
import { buildApp } from "./app.js";
import { createPrisma } from "./db.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const app = buildApp({
  prisma: createPrisma(url),
  now: () => new Date(),
  production: process.env.NODE_ENV === "production",
  trustProxy: process.env.TRUST_PROXY === "1",
});

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
