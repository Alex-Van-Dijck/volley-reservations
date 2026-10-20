import { execSync } from "node:child_process";

const TEST_URL = "postgresql://volley:volley@localhost:5433/volley_test";

export default function setup() {
  const url = process.env.DATABASE_URL ?? TEST_URL;
  if (!url.includes("volley_test")) {
    throw new Error(`Refusing to run tests against ${url}: the database name must contain volley_test`);
  }
  process.env.DATABASE_URL = url;
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env: process.env });
}
