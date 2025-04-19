import { User, Book, Author, Category, Loan, PrismaClient } from '@prisma/client';

/**
 * テスト用のダミーデータを作成する関数を提供します
 */

// ユーザーデータ作成
export function createTestUser(customData = {}) {
  const timestamp = Date.now();
  return {
    name: `テストユーザー_${timestamp}`,
    email: `test_${timestamp}@example.com`,
    password: 'password123',
    ...customData
  };
}

// 著者データ作成
export function createTestAuthor(customData = {}) {
  const timestamp = Date.now();
  return {
    name: `テスト著者_${timestamp}`,
    bio: `テスト著者の経歴情報 (${timestamp})`,
    ...customData
  };
}

// 書籍データ作成
export function createTestBook(authorId: number, customData = {}) {
  const timestamp = Date.now();
  return {
    title: `テスト書籍_${timestamp}`,
    isbn: `ISBN-${timestamp}`,
    description: `テスト書籍の説明 (${timestamp})`,
    published: new Date(),
    quantity: 3,
    available: 3,
    authorId,
    ...customData
  };
}

// カテゴリデータ作成
export function createTestCategory(customData = {}) {
  const timestamp = Date.now();
  return {
    name: `テストカテゴリ_${timestamp}`,
    description: `テストカテゴリの説明 (${timestamp})`,
    ...customData
  };
}

// 貸出データ作成
export function createTestLoan(userId: number, bookId: number, customData = {}) {
  return {
    userId,
    bookId,
    borrowedAt: new Date(),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2週間後
    returnedAt: null,
    ...customData
  };
}

// テストデータを作成するヘルパー関数
export const createTestData = async (prisma: PrismaClient) => {
  // ユーザーを作成
  const user = await prisma.user.create({
    data: createTestUser(),
  });

  // 著者を作成
  const author = await prisma.author.create({
    data: createTestAuthor(),
  });

  // カテゴリを作成
  const category = await prisma.category.create({
    data: createTestCategory(),
  });

  // 本を作成
  const book = await prisma.book.create({
    data: createTestBook(author.id),
  });

  // 本とカテゴリを関連付け
  const bookCategory = await prisma.bookCategory.create({
    data: {
      bookId: book.id,
      categoryId: category.id,
    },
  });

  // 貸出を作成
  const loan = await prisma.loan.create({
    data: {
      ...createTestLoan(user.id, book.id),
      borrowedAt: new Date(),
    },
  });

  return {
    user,
    author,
    category,
    book,
    bookCategory,
    loan,
  };
};