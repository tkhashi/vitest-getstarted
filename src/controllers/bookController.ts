import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { CreateBookDto, UpdateBookDto, ApiError } from '../types';

// すべての本を取得
export const getAllBooks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [books, total] = await Promise.all([
      prisma.book.findMany({
        skip,
        take: limit,
        include: {
          author: true,
          categories: {
            include: {
              category: true
            }
          }
        },
      }),
      prisma.book.count(),
    ]);


    // カテゴリ情報を整形
    const formattedBooks = books.map(book => ({
      ...book,
      categories: book.categories.map(bc => bc.category)
    }));

    res.json({
      data: formattedBooks,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// 特定の本を取得
export const getBookById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const numericId = parseInt(id);
    
    // IDが有効な数値かチェック
    if (id && isNaN(numericId)) {
      throw new ApiError(400, '無効なID形式です');
    }
    
    const book = await prisma.book.findUnique({
      where: { id: numericId },
      include: {
        author: true,
        categories: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!book) {
      throw new ApiError(404, '本が見つかりません');
    }

    // カテゴリ情報を整形
    const formattedBook = {
      ...book,
      categories: book.categories.map(bc => bc.category)
    };

    res.json(formattedBook);
  } catch (error) {
    next(error);
  }
};

// 新しい本を作成
export const createBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookData: CreateBookDto = req.body;
    const { categoryIds, ...bookInfo } = bookData;

    // ISBNの重複チェック
    const existingBook = await prisma.book.findUnique({
      where: { isbn: bookInfo.isbn },
    });

    if (existingBook) {
      throw new ApiError(400, 'この ISBN は既に使用されています');
    }

    // 著者の存在確認
    const author = await prisma.author.findUnique({
      where: { id: bookInfo.authorId },
    });

    if (!author) {
      throw new ApiError(404, '指定された著者が見つかりません');
    }

    // カテゴリの存在確認
    if (categoryIds && categoryIds.length > 0) {
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
      });

      if (categories.length !== categoryIds.length) {
        throw new ApiError(404, '一部のカテゴリが見つかりません');
      }
    }

    // トランザクションを使用して本とカテゴリの関連付けを作成
    const newBook = await prisma.$transaction(async (tx) => {
      // 本を作成
      const book = await tx.book.create({
        data: bookInfo,
      });

      // カテゴリの関連付け
      if (categoryIds && categoryIds.length > 0) {
        await Promise.all(
          categoryIds.map((categoryId) =>
            tx.bookCategory.create({
              data: {
                bookId: book.id,
                categoryId,
              },
            })
          )
        );
      }

      return book;
    });

    // 作成した本の詳細を取得
    const bookWithDetails = await prisma.book.findUnique({
      where: { id: newBook.id },
      include: {
        author: true,
        categories: {
          include: {
            category: true,
          },
        },
      },
    });

    // カテゴリ情報を整形
    const formattedBook = {
      ...bookWithDetails!,
      categories: bookWithDetails!.categories.map(bc => bc.category)
    };

    res.status(201).json(formattedBook);
  } catch (error) {
    next(error);
  }
};

// 本の情報を更新
export const updateBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const numericId = parseInt(id);
    const bookData: UpdateBookDto = req.body;
    const { categoryIds, ...bookInfo } = bookData;

    // IDが有効な数値かチェック
    if (id && isNaN(numericId)) {
      throw new ApiError(400, '無効なID形式です');
    }

    // 本の存在確認
    const existingBook = await prisma.book.findUnique({
      where: { id: numericId },
    });

    if (!existingBook) {
      throw new ApiError(404, '本が見つかりません');
    }

    // ISBNの変更がある場合は重複チェック
    if (bookInfo.isbn && bookInfo.isbn !== existingBook.isbn) {
      const duplicateIsbn = await prisma.book.findUnique({
        where: { isbn: bookInfo.isbn },
      });

      if (duplicateIsbn) {
        throw new ApiError(400, 'この ISBN は既に使用されています');
      }
    }

    // 著者の存在確認（著者IDの更新がある場合）
    if (bookInfo.authorId) {
      const author = await prisma.author.findUnique({
        where: { id: bookInfo.authorId },
      });

      if (!author) {
        throw new ApiError(404, '指定された著者が見つかりません');
      }
    }

    // カテゴリの存在確認
    if (categoryIds && categoryIds.length > 0) {
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
      });

      if (categories.length !== categoryIds.length) {
        throw new ApiError(404, '一部のカテゴリが見つかりません');
      }
    }

    // トランザクションを使用して本とカテゴリの関連付けを更新
    await prisma.$transaction(async (tx) => {
      // 本の情報を更新
      await tx.book.update({
        where: { id: numericId },
        data: bookInfo,
      });

      // カテゴリの関連付けを更新（categoryIdsが提供された場合）
      if (categoryIds !== undefined) {
        // 既存の関連付けを削除
        await tx.bookCategory.deleteMany({
          where: { bookId: numericId },
        });

        // 新しい関連付けを作成
        if (categoryIds.length > 0) {
          await Promise.all(
            categoryIds.map((categoryId) =>
              tx.bookCategory.create({
                data: {
                  bookId: numericId,
                  categoryId,
                },
              })
            )
          );
        }
      }
    });

    // 更新後の本の詳細を取得
    const updatedBook = await prisma.book.findUnique({
      where: { id: numericId },
      include: {
        author: true,
        categories: {
          include: {
            category: true,
          },
        },
      },
    });

    // カテゴリ情報を整形
    const formattedBook = {
      ...updatedBook!,
      categories: updatedBook!.categories.map(bc => bc.category)
    };

    res.json(formattedBook);
  } catch (error) {
    next(error);
  }
};

// 本を削除
export const deleteBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const numericId = parseInt(id);
    
    // IDが有効な数値かチェック
    if (id && isNaN(numericId)) {
      throw new ApiError(400, '無効なID形式です');
    }
    
    // 本の存在確認
    const existingBook = await prisma.book.findUnique({
      where: { id: numericId },
    });

    if (!existingBook) {
      throw new ApiError(404, '本が見つかりません');
    }

    // アクティブな貸出がある場合はエラー
    const activeLoans = await prisma.loan.count({
      where: {
        bookId: numericId,
        returnedAt: null,
      },
    });

    if (activeLoans > 0) {
      throw new ApiError(400, '貸出中の本は削除できません');
    }

    // トランザクションを使用して本とその関連を削除
    await prisma.$transaction(async (tx) => {
      // 本とカテゴリの関連付けを削除
      await tx.bookCategory.deleteMany({
        where: { bookId: numericId },
      });

      // 貸出履歴を削除
      await tx.loan.deleteMany({
        where: { bookId: numericId },
      });

      // 本を削除
      await tx.book.delete({
        where: { id: numericId },
      });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};