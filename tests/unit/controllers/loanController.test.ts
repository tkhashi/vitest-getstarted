import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import * as loanController from '../../../src/controllers/loanController';
import { ApiError } from '../../../src/types';
import { prisma as mockedPrisma } from '../../../src/prisma';

// モックを適切に設定
vi.mock('../../../src/prisma', () => {
  return {
    prisma: {
      loan: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      book: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          // トランザクション関数を実行し、その結果を返す
          return await callback({
            loan: mockedPrisma.loan,
            book: mockedPrisma.book,
            user: mockedPrisma.user,
          });
        }
        // 配列が渡された場合は、そのまま返す
        return callback;
      }),
    },
  };
});


const n = vi.fn();
describe('貸出コントローラー', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  // 共通のモックデータ
  const mockUser = { id: 1, name: 'ユーザー1', email: 'user1@example.com' };
  const mockBook = { 
    id: 1, 
    title: '本1', 
    available: 1, 
    author: { id: 1, name: '著者1' } 
  };
  const mockLoan = { 
    id: 1, 
    bookId: 1,
    userId: 1,
    borrowedAt: new Date(),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    returnedAt: null,
    user: mockUser,
    book: mockBook
  };

  beforeEach(() => {
    req = {};
    res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    next = n;

    // モックのリセット
    vi.clearAllMocks();
  });

  describe('getAllLoans', () => {
    it('貸出一覧とページネーション情報を返す', async () => {
      // モックデータ
      const mockLoans = [
        mockLoan,
        { 
          ...mockLoan,
          id: 2, 
          bookId: 2,
          returnedAt: new Date(),
          book: { ...mockBook, id: 2, title: '本2' }
        }
      ];
      const mockTotal = 2;
      
      // モックの設定
      req.query = { page: '1', limit: '10' };
      mockedPrisma.loan.findMany = vi.fn().mockResolvedValue(mockLoans);
      mockedPrisma.loan.count = vi.fn().mockResolvedValue(mockTotal);

      await loanController.getAllLoans(req as Request, res as Response, next);

      // 結果の検証
      expect(mockedPrisma.loan.findMany).toHaveBeenCalled();
      expect(mockedPrisma.loan.count).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        data: mockLoans,
        meta: {
          total: mockTotal,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
    });

    it('アクティブな貸出のみをフィルタリングする', async () => {
      // モックデータ
      const mockLoans = [mockLoan];
      const mockTotal = 1;
      
      // モックの設定
      req.query = { page: '1', limit: '10', active: 'true' };
      mockedPrisma.loan.findMany = vi.fn().mockResolvedValue(mockLoans);
      mockedPrisma.loan.count = vi.fn().mockResolvedValue(mockTotal);

      await loanController.getAllLoans(req as Request, res as Response, next);

      // アクティブな貸出のフィルターが適用されていることを確認
      expect(mockedPrisma.loan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { returnedAt: null }
        })
      );
    });

    it('エラーが発生した場合、nextにエラーを渡す', async () => {
      req.query = { page: '1', limit: '10' };

      const error = new Error('テストエラー');
      mockedPrisma.loan.findMany = vi.fn().mockRejectedValue(error);

      await loanController.getAllLoans(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getLoanById', () => {
    it('貸出が存在する場合、貸出情報を返す', async () => {
      req.params = { id: '1' };
      mockedPrisma.loan.findUnique = vi.fn().mockResolvedValue(mockLoan);

      await loanController.getLoanById(req as Request, res as Response, next);

      expect(mockedPrisma.loan.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: expect.any(Object)
      });
      expect(res.json).toHaveBeenCalledWith(mockLoan);
    });

    it('貸出が存在しない場合、404エラーを返す', async () => {
      req.params = { id: '999' };
      mockedPrisma.loan.findUnique = vi.fn().mockResolvedValue(null);

      await loanController.getLoanById(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('createLoan', () => {
    it('有効なデータの場合、新しい貸出を作成して本の利用可能数を減らす', async () => {
      const loanData = {
        userId: mockUser.id,
        bookId: mockBook.id,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2週間後
      };
      
      req.body = loanData;
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue(mockUser);
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue(mockBook);
      mockedPrisma.loan.create = vi.fn().mockResolvedValue(mockLoan);
      mockedPrisma.book.update = vi.fn().mockResolvedValue({ ...mockBook, available: 0 });

      await loanController.createLoan(req as Request, res as Response, next);

      expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id }
      });
      expect(mockedPrisma.book.findUnique).toHaveBeenCalledWith({
        where: { id: mockBook.id }
      });
      expect(mockedPrisma.book.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockBook.id },
          data: { available: { decrement: 1 } }
        })
      );
      expect(mockedPrisma.loan.create).toHaveBeenCalled();
      expect(mockedPrisma.$transaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockLoan);
    });

    it('ユーザーが存在しない場合、404エラーを返す', async () => {
      const loanData = {
        userId: 999,
        bookId: mockBook.id,
        dueDate: new Date(),
      };
      
      req.body = loanData;
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue(null);

      await loanController.createLoan(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ 
          statusCode: 404,
          message: 'ユーザーが見つかりません' 
        })
      );
    });

    it('本が存在しない場合、404エラーを返す', async () => {
      const loanData = {
        userId: mockUser.id,
        bookId: 999,
        dueDate: new Date(),
      };
      
      req.body = loanData;
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue(mockUser);
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue(null);

      await loanController.createLoan(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ 
          statusCode: 404,
          message: '本が見つかりません' 
        })
      );
    });

    it('本が利用可能でない場合、400エラーを返す', async () => {
      const loanData = {
        userId: mockUser.id,
        bookId: mockBook.id,
        dueDate: new Date(),
      };
      
      req.body = loanData;
      mockedPrisma.user.findUnique = vi.fn().mockResolvedValue(mockUser);
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue({ ...mockBook, available: 0 });

      await loanController.createLoan(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ 
          statusCode: 400,
          message: 'この本は現在利用できません' 
        })
      );
    });
  });

  describe('updateLoan', () => {
    it('本を返却する場合、returnedAtを設定し、本の利用可能数を増やす', async () => {
      const id = 1;
      const updateData = {
        returnedAt: new Date()
      };
      const updatedLoan = {
        ...mockLoan,
        returnedAt: updateData.returnedAt
      };
      
      req.params = { id: id.toString() };
      req.body = updateData;
      mockedPrisma.loan.findUnique = vi.fn().mockResolvedValue(mockLoan);
      mockedPrisma.loan.update = vi.fn().mockResolvedValue(updatedLoan);
      mockedPrisma.book.update = vi.fn().mockResolvedValue({ ...mockBook, available: 2 });

      await loanController.updateLoan(req as Request, res as Response, next);

      expect(mockedPrisma.loan.findUnique).toHaveBeenCalledWith({
        where: { id }
      });
      expect(mockedPrisma.book.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockBook.id },
          data: { available: { increment: 1 } }
        })
      );
      expect(mockedPrisma.loan.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(updatedLoan);
    });

    it('返却取り消しの場合、returnedAtをnullに設定し、本の利用可能数を減らす', async () => {
      const id = 1;
      const updateData = {
        returnedAt: null
      };
      const existingLoan = {
        ...mockLoan,
        returnedAt: new Date()
      };
      const updatedLoan = {
        ...mockLoan,
        returnedAt: null
      };
      
      req.params = { id: id.toString() };
      req.body = updateData;
      mockedPrisma.loan.findUnique = vi.fn().mockResolvedValue(existingLoan);
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue(mockBook);
      mockedPrisma.loan.update = vi.fn().mockResolvedValue(updatedLoan);
      mockedPrisma.book.update = vi.fn().mockResolvedValue({ ...mockBook, available: 0 });

      await loanController.updateLoan(req as Request, res as Response, next);

      expect(mockedPrisma.loan.findUnique).toHaveBeenCalledWith({
        where: { id }
      });
      expect(mockedPrisma.book.findUnique).toHaveBeenCalled();
      expect(mockedPrisma.book.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockBook.id },
          data: { available: { decrement: 1 } }
        })
      );
      expect(mockedPrisma.loan.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(updatedLoan);
    });

    it('返却取り消しで本が利用可能でない場合、400エラーを返す', async () => {
      const id = 1;
      const updateData = {
        returnedAt: null
      };
      const existingLoan = {
        ...mockLoan,
        returnedAt: new Date()
      };
      
      req.params = { id: id.toString() };
      req.body = updateData;
      mockedPrisma.loan.findUnique = vi.fn().mockResolvedValue(existingLoan);
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue({ ...mockBook, available: 0 });

      await loanController.updateLoan(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ 
          statusCode: 400,
          message: 'この本は現在利用できません' 
        })
      );
    });

    it('貸出が存在しない場合、404エラーを返す', async () => {
      const id = 999;
      const updateData = {
        returnedAt: new Date()
      };
      
      req.params = { id: id.toString() };
      req.body = updateData;
      mockedPrisma.loan.findUnique = vi.fn().mockResolvedValue(null);

      await loanController.updateLoan(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ 
          statusCode: 404,
          message: '貸出情報が見つかりません' 
        })
      );
    });
  });

  describe('deleteLoan', () => {
    it('返却済みの貸出を削除する', async () => {
      const id = 1;
      const returnedLoan = {
        ...mockLoan,
        returnedAt: new Date()
      };
      
      req.params = { id: id.toString() };
      mockedPrisma.loan.findUnique = vi.fn().mockResolvedValue(returnedLoan);
      mockedPrisma.loan.delete = vi.fn().mockResolvedValue(returnedLoan);

      await loanController.deleteLoan(req as Request, res as Response, next);

      expect(mockedPrisma.loan.findUnique).toHaveBeenCalledWith({
        where: { id }
      });
      expect(mockedPrisma.loan.delete).toHaveBeenCalledWith({
        where: { id }
      });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('未返却の貸出は削除できない', async () => {
      const id = 1;
      
      req.params = { id: id.toString() };
      mockedPrisma.loan.findUnique = vi.fn().mockResolvedValue(mockLoan); // returnedAt: null

      await loanController.deleteLoan(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ 
          statusCode: 400,
          message: '未返却の貸出は削除できません' 
        })
      );
      expect(mockedPrisma.loan.delete).not.toHaveBeenCalled();
    });

    it('貸出が存在しない場合、404エラーを返す', async () => {
      const id = 999;
      
      req.params = { id: id.toString() };
      mockedPrisma.loan.findUnique = vi.fn().mockResolvedValue(null);

      await loanController.deleteLoan(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ 
          statusCode: 404,
          message: '貸出情報が見つかりません' 
        })
      );
      expect(mockedPrisma.loan.delete).not.toHaveBeenCalled();
    });
  });
});