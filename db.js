
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

export async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, "sql", "schema.sql"), "utf8");
  await pool.query(sql);
}

export async function q(text, params=[]) {
  return pool.query(text, params);
}
