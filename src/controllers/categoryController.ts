import { Request, Response, NextFunction } from 'express';
import { prisma } from '../app';
import { CreateCategoryDto, UpdateCategoryDto, ApiError } from '../types';

// すべてのカテゴリを取得
export const getAllCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        skip,
        take: limit,
      }),
      prisma.category.count(),
    ]);

    res.json({
      data: categories,
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

// 特定のカテゴリを取得
export const getCategoryById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        books: {
          include: {
            book: {
              include: {
                author: true
              }
            }
          }
        },
      },
    });

    if (!category) {
      throw new ApiError(404, 'カテゴリが見つかりません');
    }

    // 本の情報を整形
    const formattedCategory = {
      ...category,
      books: category.books.map(bc => bc.book)
    };

    res.json(formattedCategory);
  } catch (error) {
    next(error);
  }
};

// 新しいカテゴリを作成
export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryData: CreateCategoryDto = req.body;
    
    // カテゴリ名の重複チェック
    const existingCategory = await prisma.category.findUnique({
      where: { name: categoryData.name },
    });

    if (existingCategory) {
      throw new ApiError(400, 'このカテゴリ名は既に使用されています');
    }

    const newCategory = await prisma.category.create({
      data: categoryData,
    });

    res.status(201).json(newCategory);
  } catch (error) {
    next(error);
  }
};

// カテゴリ情報を更新
export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const categoryData: UpdateCategoryDto = req.body;

    // カテゴリの存在確認
    const existingCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new ApiError(404, 'カテゴリが見つかりません');
    }

    // カテゴリ名の変更がある場合は重複チェック
    if (categoryData.name && categoryData.name !== existingCategory.name) {
      const duplicateName = await prisma.category.findUnique({
        where: { name: categoryData.name },
      });

      if (duplicateName) {
        throw new ApiError(400, 'このカテゴリ名は既に使用されています');
      }
    }

    const updatedCategory = await prisma.category.update({
      where: { id },
      data: categoryData,
    });

    res.json(updatedCategory);
  } catch (error) {
    next(error);
  }
};

// カテゴリを削除
export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    
    // カテゴリの存在確認
    const existingCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new ApiError(404, 'カテゴリが見つかりません');
    }

    // カテゴリに関連付けられた本の確認
    const booksCount = await prisma.bookCategory.count({
      where: { categoryId: id },
    });

    if (booksCount > 0) {
      throw new ApiError(400, 'このカテゴリに関連付けられた本があるため削除できません');
    }

    await prisma.category.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};