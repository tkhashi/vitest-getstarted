import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { CreateAuthorDto, UpdateAuthorDto, ApiError } from '../types';

// すべての著者を取得
export const getAllAuthors = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [authors, total] = await Promise.all([
      prisma.author.findMany({
        skip,
        take: limit,
      }),
      prisma.author.count(),
    ]);

    res.json({
      data: authors,
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

// 特定の著者を取得
export const getAuthorById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const numericId = parseInt(id);
    
    // IDが有効な数値かチェック
    if (id && isNaN(numericId)) {
      throw new ApiError(400, '無効なID形式です');
    }
    
    const author = await prisma.author.findUnique({
      where: { id: numericId },
      include: {
        books: {
          include: {
            categories: {
              include: {
                category: true
              }
            }
          }
        },
      },
    });

    if (!author) {
      throw new ApiError(404, '著者が見つかりません');
    }

    // 本の情報を整形
    const formattedAuthor = {
      ...author,
      books: author.books.map(book => ({
        ...book,
        categories: book.categories.map(bc => bc.category)
      }))
    };

    res.json(formattedAuthor);
  } catch (error) {
    next(error);
  }
};

// 新しい著者を作成
export const createAuthor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorData: CreateAuthorDto = req.body;
    
    const newAuthor = await prisma.author.create({
      data: authorData,
    });

    res.status(201).json(newAuthor);
  } catch (error) {
    next(error);
  }
};

// 著者情報を更新
export const updateAuthor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const numericId = parseInt(id);
    const authorData: UpdateAuthorDto = req.body;

    // IDが有効な数値かチェック
    if (id && isNaN(numericId)) {
      throw new ApiError(400, '無効なID形式です');
    }

    // 著者の存在確認
    const existingAuthor = await prisma.author.findUnique({
      where: { id: numericId },
    });

    if (!existingAuthor) {
      throw new ApiError(404, '著者が見つかりません');
    }

    const updatedAuthor = await prisma.author.update({
      where: { id: numericId },
      data: authorData,
    });

    res.json(updatedAuthor);
  } catch (error) {
    next(error);
  }
};

// 著者を削除
export const deleteAuthor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const numericId = parseInt(id);
    
    // IDが有効な数値かチェック
    if (id && isNaN(numericId)) {
      throw new ApiError(400, '無効なID形式です');
    }
    
    // 著者の存在確認
    const existingAuthor = await prisma.author.findUnique({
      where: { id: numericId },
    });

    if (!existingAuthor) {
      throw new ApiError(404, '著者が見つかりません');
    }

    // 著者に関連付けられた本の確認
    const booksCount = await prisma.book.count({
      where: { authorId: numericId },
    });

    if (booksCount > 0) {
      throw new ApiError(400, 'この著者に関連付けられた本があるため削除できません');
    }

    await prisma.author.delete({
      where: { id: numericId },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};