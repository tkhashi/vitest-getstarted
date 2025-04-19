import { Request, Response, NextFunction } from 'express';
import { prisma } from '../app';
import { CreateBookDto, UpdateBookDto, ApiError } from '../types';

// すべての本を取得
export const getAllBooks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('query:', req.query);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    console.log('req page:', req.query.page);

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

    console.log(`ここまで来れるか？: ${JSON.stringify(formattedBooks)}`);
    console.log(`meta: ${JSON.stringify({ total, page, limit, totalPages: Math.ceil(total / limit) })}`);

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
    console.log('Error fetching books:', error);
    next(error);
  }
};

// 特定の本を取得
export const getBookById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const book = await prisma.book.findUnique({
      where: { id },
      include: {
        author: true,
        categories: {
          include: {
            category: true
          }
        },
        loans: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        }
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
    const id = parseInt(req.params.id);
    const bookData: UpdateBookDto = req.body;
    const { categoryIds, ...bookInfo } = bookData;

    // 本の存在確認
    const existingBook = await prisma.book.findUnique({
      where: { id },
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
        console.error('ISBN重複エラー:', duplicateIsbn);
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
        where: { id },
        data: bookInfo,
      });

      // カテゴリの関連付けを更新（categoryIdsが提供された場合）
      if (categoryIds !== undefined) {
        // 既存の関連付けを削除
        await tx.bookCategory.deleteMany({
          where: { bookId: id },
        });

        // 新しい関連付けを作成
        if (categoryIds.length > 0) {
          await Promise.all(
            categoryIds.map((categoryId) =>
              tx.bookCategory.create({
                data: {
                  bookId: id,
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
      where: { id },
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
    const id = parseInt(req.params.id);
    
    // 本の存在確認
    const existingBook = await prisma.book.findUnique({
      where: { id },
    });

    if (!existingBook) {
      throw new ApiError(404, '本が見つかりません');
    }

    // アクティブな貸出がある場合はエラー
    const activeLoans = await prisma.loan.count({
      where: {
        bookId: id,
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
        where: { bookId: id },
      });

      // 貸出履歴を削除
      await tx.loan.deleteMany({
        where: { bookId: id },
      });

      // 本を削除
      await tx.book.delete({
        where: { id },
      });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};