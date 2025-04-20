import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../../src/app';
import { prisma } from '../setup'; // テスト用のPrismaインスタンスを使用
import { createTestUser, createTestAuthor, createTestBook } from '../fixtures/testData';

const request = supertest(app);

describe('本の貸出フローE2Eテスト', () => {
  let userId: number;
  let authorId: number;
  let bookId: number;
  let loanId: number;

  beforeAll(async () => {
    // テストデータをクリーンアップ
    await prisma.loan.deleteMany({});
    await prisma.bookCategory.deleteMany({});
    await prisma.book.deleteMany({});
    await prisma.author.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    // テストデータをクリーンアップ
    await prisma.loan.deleteMany({});
    await prisma.bookCategory.deleteMany({});
    await prisma.book.deleteMany({});
    await prisma.author.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it('ユーザーを作成できる', async () => {
    const userData = createTestUser();
    
    const response = await request
      .post('/api/users')
      .send(userData)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    userId = response.body.id;
  });

  it('著者を作成できる', async () => {
    const authorData = createTestAuthor();
    
    const response = await request
      .post('/api/authors')
      .send(authorData)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    authorId = response.body.id;
  });

  it('本を作成できる', async () => {
    const bookData = {
      ...createTestBook(authorId),
      categoryIds: [] // カテゴリなしで作成
    };
    
    const response = await request
      .post('/api/books')
      .send(bookData)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    bookId = response.body.id;
    
    // 本の数量と利用可能数を確認
    expect(response.body.quantity).toBe(bookData.quantity);
    expect(response.body.available).toBe(bookData.available);
  });

  it('本の詳細を取得できる', async () => {
    const response = await request
      .get(`/api/books/${bookId}`)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('id', bookId);
    expect(response.body).toHaveProperty('author');
    expect(response.body.author).toHaveProperty('id', authorId);
  });

  it('本を借りることができる（貸出作成）', async () => {
    const loanData = {
      userId,
      bookId,
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 2週間後
    };
    
    const response = await request
      .post('/api/loans')
      .send(loanData)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).toHaveProperty('id');
    loanId = response.body.id;
    expect(response.body.userId).toBe(userId);
    expect(response.body.bookId).toBe(bookId);
    expect(response.body).toHaveProperty('borrowedAt');
    expect(response.body.returnedAt).toBeNull();
    
    // 本の利用可能数が減っていることを確認
    const bookResponse = await request
      .get(`/api/books/${bookId}`)
      .expect(200);
    
    expect(bookResponse.body.available).toBe(2); // 最初は3、1冊借りたので2になる
  });

  it('貸出の詳細を取得できる', async () => {
    const response = await request
      .get(`/api/loans/${loanId}`)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('id', loanId);
    expect(response.body).toHaveProperty('user');
    expect(response.body.user).toHaveProperty('id', userId);
    expect(response.body).toHaveProperty('book');
    expect(response.body.book).toHaveProperty('id', bookId);
  });

  it('アクティブな貸出一覧を取得できる', async () => {
    const response = await request
      .get('/api/loans?active=true')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBeGreaterThan(0);
    
    // 返却されていない貸出のみが含まれていることを確認
    const activeLoan = response.body.data.find((loan: any) => loan.id === loanId);
    expect(activeLoan).toBeDefined();
    expect(activeLoan.returnedAt).toBeNull();
  });

  it('本を返却できる（貸出更新）', async () => {
    const updateData = {
      returnedAt: new Date().toISOString()
    };
    
    const response = await request
      .put(`/api/loans/${loanId}`)
      .send(updateData)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('id', loanId);
    expect(response.body).toHaveProperty('returnedAt');
    expect(response.body.returnedAt).not.toBeNull();
    
    // 本の利用可能数が増えていることを確認
    const bookResponse = await request
      .get(`/api/books/${bookId}`)
      .expect(200);
    
    expect(bookResponse.body.available).toBe(3); // 返却したので3に戻る
  });

  it('アクティブな貸出一覧に返却済みの貸出が含まれていないことを確認', async () => {
    const response = await request
      .get('/api/loans?active=true')
      .expect('Content-Type', /json/)
      .expect(200);

    // 返却済みの貸出が含まれていないことを確認
    const activeLoan = response.body.data.find((loan: any) => loan.id === loanId);
    expect(activeLoan).toBeUndefined();
  });

  it('返却済みの貸出を削除できる', async () => {
    await request
      .delete(`/api/loans/${loanId}`)
      .expect(204);

    // 削除されたことを確認
    await request
      .get(`/api/loans/${loanId}`)
      .expect(404);
  });

  it('本を削除できる', async () => {
    await request
      .delete(`/api/books/${bookId}`)
      .expect(204);

    // 削除されたことを確認
    await request
      .get(`/api/books/${bookId}`)
      .expect(404);
  });

  it('著者を削除できる', async () => {
    await request
      .delete(`/api/authors/${authorId}`)
      .expect(204);

    // 削除されたことを確認
    await request
      .get(`/api/authors/${authorId}`)
      .expect(404);
  });

  it('ユーザーを削除できる', async () => {
    await request
      .delete(`/api/users/${userId}`)
      .expect(204);

    // 削除されたことを確認
    await request
      .get(`/api/users/${userId}`)
      .expect(404);
  });
});