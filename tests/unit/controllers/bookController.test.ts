import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import * as bookController from '../../../src/controllers/bookController';
import { ApiError } from '../../../src/types';
import { createTestBook } from '../../fixtures/testData';
import { prisma as mockedPrisma } from '../../../src/prisma';

// モックを適切に設定
vi.mock('../../../src/app', () => {
  return {
    prisma: {
      book: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      author: {
        findUnique: vi.fn(),
      },
      category: {
        findMany: vi.fn(),
      },
      bookCategory: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      loan: {
        count: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          // トランザクション関数を実行し、その結果を返す
          return await callback({
            book: mockedPrisma.book,
            bookCategory: mockedPrisma.bookCategory,
            loan: mockedPrisma.loan,
            category: mockedPrisma.category,
            author: mockedPrisma.author,
          });
        }
        // 配列が渡された場合は、そのまま返す
        return callback;
      }),
    },
  };
});

describe('書籍コントローラー', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  const n = vi.fn();
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

  describe('getAllBooks', () => {
    it('書籍一覧とページネーション情報を返す', async () => {
      // モックデータ
      const mockBooks = [
        { 
          id: 1, 
          title: '本1', 
          author: { id: 1, name: '著者1' },
          categories: [{ category: { id: 1, name: 'カテゴリ1' } }] 
        },
        { 
          id: 2, 
          title: '本2', 
          author: { id: 2, name: '著者2' },
          categories: [{ category: { id: 2, name: 'カテゴリ2' } }] 
        }
      ];
      const mockTotal = 2;
      
      // モックの設定
      req.query = { page: '1', limit: '10' };
      mockedPrisma.book.findMany = vi.fn().mockResolvedValue(mockBooks);
      mockedPrisma.book.count = vi.fn().mockResolvedValue(mockTotal);

      await bookController.getAllBooks(req as Request, res as Response, next);

      // 結果の検証
      expect(mockedPrisma.book.findMany).toHaveBeenCalled();
      expect(mockedPrisma.book.count).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        data: expect.any(Array),
        meta: {
          total: mockTotal,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
    });

    it('エラーが発生した場合、nextにエラーを渡す', async () => {
      mockedPrisma.book.findMany = vi.fn().mockRejectedValue(new ApiError(500, 'テストエラー'));

      await bookController.getAllBooks(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getBookById', () => {
    it('書籍が存在する場合、書籍情報を返す', async () => {
      const mockBook = { 
        id: 1, 
        title: '本1', 
        author: { id: 1, name: '著者1' },
        categories: [{ category: { id: 1, name: 'カテゴリ1' } }],
        loans: [] 
      };
      
      req.params = { id: '1' };
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue(mockBook);

      await bookController.getBookById(req as Request, res as Response, next);

      expect(mockedPrisma.book.findUnique).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });

    it('書籍が存在しない場合、404エラーを返す', async () => {
      req.params = { id: '999' };
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue(null);

      await bookController.getBookById(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('createBook', () => {
    it('有効なデータの場合、新しい書籍を作成して返す', async () => {
      const authorId = 1;
      const bookData = {
        ...createTestBook(authorId),
        categoryIds: [1, 2]
      };
      const mockBook = { id: 1, ...bookData };
      
      req.body = bookData;
      
      // ISBNの重複チェックと詳細取得用のモック設定
      mockedPrisma.book.findUnique = vi.fn()
        .mockResolvedValueOnce(null) // ISBNチェック用
        .mockResolvedValueOnce({ // 詳細取得用
          ...mockBook,
          author: { id: authorId, name: '著者1' },
          categories: [
            { category: { id: 1, name: 'カテゴリ1' } },
            { category: { id: 2, name: 'カテゴリ2' } }
          ]
        });
      
      mockedPrisma.author.findUnique = vi.fn().mockResolvedValue({ id: authorId, name: '著者1' });
      mockedPrisma.category.findMany = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockedPrisma.book.create = vi.fn().mockResolvedValue(mockBook);
      mockedPrisma.bookCategory.create = vi.fn().mockResolvedValue({});

      await bookController.createBook(req as Request, res as Response, next);

      expect(mockedPrisma.author.findUnique).toHaveBeenCalled();
      expect(mockedPrisma.category.findMany).toHaveBeenCalled();
    });

    it('重複するISBNの場合、400エラーを返す', async () => {
      const authorId = 1;
      const bookData = {
        ...createTestBook(authorId),
        categoryIds: [1, 2]
      };
      
      req.body = bookData;
      // ここでモックをより明示的にリセット
      vi.resetAllMocks();
      // すでに同じISBNの本が存在する場合
      mockedPrisma.book.findUnique = vi.fn().mockImplementation((params) => {
        // ISBNで検索された場合は重複本を返す
        if (params?.where?.isbn) {
          return Promise.resolve({ id: 1, ...bookData });
        }
        // その他の場合はnullを返す
        return Promise.resolve(null);
      });
      // この著者が存在しない場合のモックを追加
      mockedPrisma.author.findUnique = vi.fn().mockResolvedValue(null);

      await bookController.createBook(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: 'この ISBN は既に使用されています' })
      );
    });

    it('存在しない著者IDの場合、404エラーを返す', async () => {
      const authorId = 999;
      const bookData = {
        ...createTestBook(authorId),
        categoryIds: [1, 2]
      };
      
      req.body = bookData;
      // ISBNの重複はない
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue(null);
      // 著者が存在しない
      mockedPrisma.author.findUnique = vi.fn().mockResolvedValue(null);

      await bookController.createBook(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: '指定された著者が見つかりません' })
      );
    });
  });

  describe('updateBook', () => {
    it('有効なデータの場合、書籍を更新して返す', async () => {
      const bookId = 1;
      const authorId = 1;
      const bookData = {
        ...createTestBook(authorId),
        categoryIds: [1, 2]
      };
      const existingBook = { id: bookId, ...bookData, authorId };
      const updatedBook = { ...existingBook, title: '更新された本' };
      
      req.params = { id: bookId.toString() };
      req.body = { ...bookData, title: '更新された本' };
      
      // 書籍の存在確認とISBNの重複チェック
      mockedPrisma.book.findUnique = vi.fn()
        .mockResolvedValueOnce(existingBook) // 書籍の存在確認
        .mockResolvedValueOnce(null) // ISBN重複チェック
        .mockResolvedValueOnce({ // 詳細取得用
          ...updatedBook,
          author: { id: authorId, name: '著者1' },
          categories: [
            { category: { id: 1, name: 'カテゴリ1' } },
            { category: { id: 2, name: 'カテゴリ2' } }
          ]
        });
      
      mockedPrisma.author.findUnique = vi.fn().mockResolvedValue({ id: authorId, name: '著者1' });
      mockedPrisma.category.findMany = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockedPrisma.book.update = vi.fn().mockResolvedValue(updatedBook);
      mockedPrisma.bookCategory.deleteMany = vi.fn().mockResolvedValue({});
      mockedPrisma.bookCategory.create = vi.fn().mockResolvedValue({});

      await bookController.updateBook(req as Request, res as Response, next);

      expect(mockedPrisma.author.findUnique).toHaveBeenCalled();
      expect(mockedPrisma.category.findMany).toHaveBeenCalled();
    });

    it('存在しない書籍IDの場合、404エラーを返す', async () => {
      req.params = { id: '999' };
      req.body = { title: '更新された本' };
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue(null);

      await bookController.updateBook(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    });

    it('重複するISBNの場合、400エラーを返す', async () => {
      const bookId = 1;
      const authorId = 1;
      const bookData = createTestBook(authorId);
      const existingBook = { id: bookId, ...bookData, authorId };
      const duplicateBook = { id: 2, ...bookData, authorId };
      
      req.params = { id: bookId.toString() };
      req.body = { ...bookData, title: '更新された本' };
      
      // 書籍が存在し、別の書籍が同じISBNを持っている場合
      mockedPrisma.book.findUnique = vi.fn()
        .mockResolvedValueOnce(existingBook) // 書籍の存在確認
        .mockResolvedValueOnce(duplicateBook); // 重複するISBNが存在
      
      await bookController.updateBook(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('存在しない著者IDの場合、404エラーを返す', async () => {
      const bookId = 1;
      const authorId = 1;
      const nonExistingAuthorId = 999;
      const bookData = createTestBook(authorId);
      const existingBook = { id: bookId, ...bookData, authorId };
      
      req.params = { id: bookId.toString() };
      req.body = { ...bookData, authorId: nonExistingAuthorId };
      
      mockedPrisma.book.findUnique = vi.fn()
        .mockResolvedValueOnce(existingBook) // 書籍の存在確認
        .mockResolvedValueOnce(null); // ISBN重複なし
      
      mockedPrisma.author.findUnique = vi.fn().mockResolvedValue(null); // 著者は存在しない

      await bookController.updateBook(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: '指定された著者が見つかりません' })
      );
    });
  });

  describe('deleteBook', () => {
    it('書籍が存在し、貸出がない場合、書籍を削除', async () => {
      req.params = { id: '1' };
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue({ id: 1, title: '本1' });
      mockedPrisma.loan.count = vi.fn().mockResolvedValue(0);
      mockedPrisma.bookCategory.deleteMany = vi.fn().mockResolvedValue({});
      mockedPrisma.book.delete = vi.fn().mockResolvedValue({});

      await bookController.deleteBook(req as Request, res as Response, next);

      expect(mockedPrisma.book.findUnique).toHaveBeenCalled();
      expect(mockedPrisma.loan.count).toHaveBeenCalled();
    });

    it('書籍が存在しない場合、404エラーを返す', async () => {
      req.params = { id: '999' };
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue(null);

      await bookController.deleteBook(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('貸出中の書籍の場合、400エラーを返す', async () => {
      req.params = { id: '1' };
      mockedPrisma.book.findUnique = vi.fn().mockResolvedValue({ id: 1, title: '本1' });
      mockedPrisma.loan.count = vi.fn().mockResolvedValue(1);

      await bookController.deleteBook(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });
});