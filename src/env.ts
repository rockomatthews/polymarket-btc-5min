import { z } from "zod";
import "dotenv/config";

const EnvSchema = z.object({
  CLOB_HOST: z.string().default("https://clob.polymarket.com"),
  CHAIN_ID: z.coerce.number().default(137),

  PRIVATE_KEY: z.string().min(1, "PRIVATE_KEY is required"),
  FUNDER_ADDRESS: z.string().min(1, "FUNDER_ADDRESS is required"),
  SIGNATURE_TYPE: z.coerce.number().int().min(0).max(1).default(1),

  CLOB_API_KEY: z.string().optional(),
  CLOB_API_SECRET: z.string().optional(),
  CLOB_API_PASSPHRASE: z.string().optional(),

  DRY_RUN: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),

  MAX_TOTAL_USD: z.coerce.number().positive().default(200),
  MAX_USD_PER_TRADE: z.coerce.number().positive().default(25),

  EDGE_REQUIRED: z.coerce.number().min(0).default(0.01),
  POLL_MS: z.coerce.number().int().min(250).default(1500),

  MARKET_SLUGS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [])),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(msg);
  }
  return parsed.data;
}
