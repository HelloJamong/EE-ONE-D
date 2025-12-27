import { PrismaClient } from "@prisma/client";
import { AppConfig } from "./env.js";

let prisma: PrismaClient | null = null;

export function getPrisma(config: AppConfig) {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: { db: { url: config.DATABASE_URL } },
    });
  }
  return prisma;
}
