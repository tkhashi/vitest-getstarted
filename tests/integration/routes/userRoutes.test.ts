import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import app from '../../../src/app';
import { prisma } from '../../../src/prisma';  // アプリケーションのPrismaクライアントを使用
import { createTestUser } from '../../fixtures/testData';

const request = supertest(app);

describe('ユーザーAPI統合テスト', () => {
  let testUserId: number;

  beforeEach(async () => {
    // テスト用のユーザーを作成
    const userData = createTestUser();
    const user = await prisma.user.create({
      data: userData
    });
    testUserId = user.id;
    console.log(`テストユーザーを作成しました: ID=${user.id}, Email=${user.email}`);
  });

  afterEach(async () => {
    // テストで作成したデータを削除（依存関係の順序に注意）
    await prisma.loan.deleteMany({});        // 最初に貸出データを削除
    await prisma.bookCategory.deleteMany({}); // 次に書籍とカテゴリの関連を削除
    await prisma.book.deleteMany({});         // その後に書籍を削除
    await prisma.category.deleteMany({});     // カテゴリを削除
    await prisma.author.deleteMany({});       // 著者を削除
    await prisma.user.deleteMany({});         // 最後にユーザーを削除
  });

  describe('GET /api/users', () => {
    it('ユーザー一覧を取得できる', async () => {
      const response = await request
        .get('/api/users')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.meta).toHaveProperty('total');
    });

    it('ページネーションパラメータが適用される', async () => {
      const response = await request
        .get('/api/users?page=1&limit=5')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(5);
    });
  });

  describe('GET /api/users/:id', () => {
    it('存在するユーザーのIDでユーザー詳細を取得できる', async () => {
      // ここでテストデータの存在確認
      const existingUser = await prisma.user.findUnique({
        where: { id: testUserId }
      });
      console.log('テストユーザー存在確認:', existingUser); // デバッグ用ログ
      
      expect(existingUser).not.toBeNull();
      
      const response = await request
        .get(`/api/users/${testUserId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('id', testUserId);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('email');
    });

    it('存在しないユーザーIDの場合404を返す', async () => {
      await request
        .get('/api/users/9999')
        .expect('Content-Type', /json/)
        .expect(404);
    });
  });

  describe('POST /api/users', () => {
    it('有効なデータで新しいユーザーを作成できる', async () => {
      const newUser = {
        name: '新規ユーザー',
        email: `new-${Date.now()}@example.com`,
        password: 'password123'
      };

      const response = await request
        .post('/api/users')
        .send(newUser)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', newUser.name);
      expect(response.body).toHaveProperty('email', newUser.email);
      // パスワードは返却されないことを確認
      expect(response.body).not.toHaveProperty('password');
    });

    it('既存のメールアドレスの場合400を返す', async () => {
      // テスト用のユーザー情報を取得
      const existingUser = await prisma.user.findUnique({
        where: { id: testUserId }
      });

      if (!existingUser) {
        throw new Error('テストユーザーが見つかりません');
      }

      const duplicateUser = {
        name: '重複ユーザー',
        email: existingUser.email,
        password: 'password123'
      };

      await request
        .post('/api/users')
        .send(duplicateUser)
        .expect('Content-Type', /json/)
        .expect(400);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('有効なデータでユーザー情報を更新できる', async () => {
      const updateData = {
        name: '更新後の名前'
      };

      const response = await request
        .put(`/api/users/${testUserId}`)
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('id', testUserId);
      expect(response.body).toHaveProperty('name', updateData.name);
    });

    it('存在しないユーザーIDの場合404を返す', async () => {
      const updateData = {
        name: '更新後の名前'
      };

      await request
        .put('/api/users/9999')
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(404);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('存在するユーザーを削除できる', async () => {
      await request
        .delete(`/api/users/${testUserId}`)
        .expect(204);

      // 削除されたことを確認
      const deletedUser = await prisma.user.findUnique({
        where: { id: testUserId }
      });
      expect(deletedUser).toBeNull();
    });

    it('存在しないユーザーIDの場合404を返す', async () => {
      await request
        .delete('/api/users/9999')
        .expect('Content-Type', /json/)
        .expect(404);
    });

    it('貸出中のユーザーは削除できない', async () => {
      // テストの前に状態を確認
      const initialUser = await prisma.user.findUnique({
        where: { id: testUserId },
        include: { loans: true }
      });
      
      // テスト用の著者を作成
      const author = await prisma.author.create({
        data: {
          name: 'テスト著者',
          bio: 'テスト用の著者プロフィール'
        }
      });

      // テスト用の本を作成
      const book = await prisma.book.create({
        data: {
          title: 'テスト本',
          isbn: `ISBN-${Date.now()}`,
          description: 'テスト用の本の説明',
          published: new Date(),
          quantity: 1,
          available: 1,
          authorId: author.id
        }
      });

      // テスト用の貸出を作成（未返却）
      const loan = await prisma.loan.create({
        data: {
          userId: testUserId,
          bookId: book.id,
          borrowedAt: new Date(),
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2週間後
          returnedAt: null
        }
      });

      // 本の利用可能数を更新
      await prisma.book.update({
        where: { id: book.id },
        data: { available: 0 }
      });

      // 貸出が実際に作成されたことを確認
      const activeLoans = await prisma.loan.count({
        where: {
          userId: testUserId,
          returnedAt: null
        }
      });
      expect(activeLoans).toBeGreaterThan(0);

      // 貸出中のユーザーを削除しようとすると400エラー
      const response = await request
        .delete(`/api/users/${testUserId}`)
        .expect('Content-Type', /json/)
        .expect(400);
      
      // エラーの検証方法を変更
      const responseBody = response.body;
      // 複数の方法でエラーメッセージを検証
      if (typeof responseBody === 'object' && responseBody !== null) {
        // エラーメッセージが直接オブジェクトにある場合
        expect(responseBody.message || responseBody.error || responseBody).toMatch(/未返却の本があるユーザーは削除できません/);
      } else if (typeof responseBody === 'string') {
        // レスポンスが文字列の場合
        expect(responseBody).toMatch(/未返却の本があるユーザーは削除できません/);
      }
    });
  });
});