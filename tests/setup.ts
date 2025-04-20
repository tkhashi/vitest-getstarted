import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';

// テスト用のデータベースパスを設定
const testDbPath = path.join(__dirname, '../prisma/test.db');

// テスト用のPrismaクライアント
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${testDbPath}`,
    },
  },
  log: ['query', 'error', 'warn'],  // ログレベルを追加して詳細な情報を表示
});

// グローバルな前処理
beforeAll(async () => {
  // テスト用のデータベースを初期化
  try {
    // 環境変数を明示的に設定してマイグレーションを実行
    process.env.DATABASE_URL = `file:${testDbPath}`;
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    
    // データベース接続を確認
    await prisma.$connect();
    console.log('テスト用データベースに接続しました');
  } catch (error) {
    console.error('データベース初期化エラー:', error);
    throw error;
  }
});

// グローバルな後処理
afterAll(async () => {
  // Prismaクライアントを切断
  await prisma.$disconnect();
});

// 各テストの前処理
beforeEach(async () => {
  try {
    // テストデータをクリーンアップ
    await prisma.loan.deleteMany({});
    await prisma.bookCategory.deleteMany({});
    await prisma.book.deleteMany({});
    await prisma.author.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
  } catch (error) {
    console.error('テストデータクリーンアップエラー:', error);
    // テストを続行
  }
});

// 各テストの後処理
afterEach(async () => {
  // 必要に応じて追加のクリーンアップ
});