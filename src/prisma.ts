import { PrismaClient } from '@prisma/client';

// Prismaクライアントのグローバルインスタンス
// テスト環境と本番環境で異なるデータベース接続を使用
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'test' ? ['query', 'error', 'warn'] : ['error'],
});

export { prisma };