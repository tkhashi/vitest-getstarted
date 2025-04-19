import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import * as userController from '../../../src/controllers/userController';
import { ApiError } from '../../../src/types';
import { prisma } from '../../setup';
import { createTestUser } from '../../fixtures/testData';

// モックを適切に設定
vi.mock('../../../src/app', () => {
  return {
    prisma: {
      user: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      loan: {
        count: vi.fn(),
      },
    },
  };
});

// インポートを再割り当て
// @ts-ignore - 型エラーを無視（テスト用）
import { prisma as mockedPrisma } from '../../../src/app';

describe('ユーザーコントローラー', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  const n = vi.fn();
  beforeEach(() => {
    req = {};
    res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    next = n;

    // モックのリセット
    vi.clearAllMocks();
  });

  describe('getAllUsers', () => {
    it('ユーザー一覧とページネーション情報を返す', async () => {
      // モックデータ
      const mockUsers = [{ id: 1, name: 'ユーザー1' }, { id: 2, name: 'ユーザー2' }];
      const mockTotal = 2;
      
      // モックの設定
      req.query = { page: '1', limit: '10' };
      mockedPrisma.user.findMany = vi.fn().mockResolvedValue(mockUsers);
      mockedPrisma.user.count = vi.fn().mockResolvedValue(mockTotal);

      await userController.getAllUsers(req as Request, res as Response, next);

      // 結果の検証
      expect(mockedPrisma.user.findMany).toHaveBeenCalled();
      expect(mockedPrisma.user.count).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        data: mockUsers,
        meta: {
          total: mockTotal,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
    });

    it('エラーが発生した場合、nextにエラーを渡す', async () => {
      // req.queryを設定して型エラーを回避
      req.query = { page: '1', limit: '10' };
      
      const error = new Error('テストエラー');
      mockedPrisma.user.findMany = vi.fn().mockRejectedValue(error);

      await userController.getAllUsers(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getUserById', () => {
    it('ユーザーが存在する場合、ユーザー情報を返す', async () => {
      const mockUser = { id: 1, name: 'ユーザー1' };
      
      req.params = { id: '1' };
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue(mockUser);

      await userController.getUserById(req as Request, res as Response, next);

      expect(mockedPrisma.user.findUnique).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockUser);
    });

    it('ユーザーが存在しない場合、404エラーを返す', async () => {
      req.params = { id: '999' };
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue(null);

      await userController.getUserById(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('createUser', () => {
    it('有効なデータの場合、新しいユーザーを作成して返す', async () => {
      const userData = createTestUser();
      const mockUser = { id: 1, ...userData };
      
      req.body = userData;
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue(null);
      mockedPrisma.user.create = vi.fn().mockResolvedValue(mockUser);

      await userController.createUser(req as Request, res as Response, next);

      expect(mockedPrisma.user.findUnique).toHaveBeenCalled();
      expect(mockedPrisma.user.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockUser);
    });

    it('既存のメールアドレスの場合、400エラーを返す', async () => {
      const userData = createTestUser();
      
      req.body = userData;
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue({ id: 1, ...userData });

      await userController.createUser(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('updateUser', () => {
    it('ユーザーが存在し、データが有効な場合、ユーザー情報を更新して返す', async () => {
      const existingUser = { id: 1, name: '元の名前', email: 'test@example.com', password: 'password' };
      const updateData = { name: '新しい名前' };
      const updatedUser = { ...existingUser, ...updateData };
      
      req.params = { id: '1' };
      req.body = updateData;
      mockedPrisma.user.findUnique = vi.fn()
        .mockResolvedValueOnce(existingUser) // 最初の呼び出し（ユーザー存在チェック）
        .mockResolvedValueOnce(null); // 2回目の呼び出し（メールアドレス重複チェック）
      mockedPrisma.user.update = vi.fn().mockResolvedValue(updatedUser);

      await userController.updateUser(req as Request, res as Response, next);

      expect(mockedPrisma.user.findUnique).toHaveBeenCalled();
      expect(mockedPrisma.user.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it('ユーザーが存在しない場合、404エラーを返す', async () => {
      req.params = { id: '999' };
      req.body = { name: '新しい名前' };
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue(null);

      await userController.updateUser(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('deleteUser', () => {
    it('ユーザーが存在し、未返却の貸出がない場合、ユーザーを削除', async () => {
      req.params = { id: '1' };
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue({ id: 1, name: 'ユーザー1' });
      mockedPrisma.loan.count = vi.fn().mockResolvedValue(0);
      mockedPrisma.user.delete = vi.fn().mockResolvedValue({ id: 1 });

      await userController.deleteUser(req as Request, res as Response, next);

      expect(mockedPrisma.user.findUnique).toHaveBeenCalled();
      expect(mockedPrisma.loan.count).toHaveBeenCalled();
      expect(mockedPrisma.user.delete).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('ユーザーが存在しない場合、404エラーを返す', async () => {
      req.params = { id: '999' };
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue(null);

      await userController.deleteUser(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('未返却の貸出がある場合、400エラーを返す', async () => {
      req.params = { id: '1' };
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue({ id: 1, name: 'ユーザー1' });
      mockedPrisma.loan.count = vi.fn().mockResolvedValue(1);

      await userController.deleteUser(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });
});