import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { CreateUserDto, UpdateUserDto, ApiError } from '../types';

// すべてのユーザーを取得
export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          password: false, // パスワードは返さない
        },
      }),
      prisma.user.count(),
    ]);

    res.json({
      data: users,
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

// 特定のユーザーを取得
export const getUserById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const numericId = parseInt(id);
    
    // IDが有効な数値かチェック
    if (id && isNaN(numericId)) {
      throw new ApiError(400, '無効なID形式です');
    }
    
    const user = await prisma.user.findUnique({
      where: { id: numericId },
      include: {
        loans: {
          include: {
            book: {
              include: {
                author: true
              }
            }
          },
          orderBy: {
            borrowedAt: 'desc'
          }
        }
      }
    });

    if (!user) {
      throw new ApiError(404, 'ユーザーが見つかりません');
    }

    // パスワードを除外
    const { password, ...userWithoutPassword } = user;

    res.json(userWithoutPassword);
  } catch (error) {
    next(error);
  }
};

// 新しいユーザーを作成
export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userData: CreateUserDto = req.body;
    
    // メールアドレスの重複チェック
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (existingUser) {
      throw new ApiError(400, 'このメールアドレスは既に使用されています');
    }

    const newUser = await prisma.user.create({
      data: userData,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    res.status(201).json(newUser);
  } catch (error) {
    next(error);
  }
};

// ユーザー情報を更新
export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const userData: UpdateUserDto = req.body;

    // IDが有効な数値かチェック
    if (isNaN(id)) {
      throw new ApiError(400, '無効なID形式です');
    }

    // ユーザーの存在確認
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new ApiError(404, 'ユーザーが見つかりません');
    }

    // メールアドレスの変更がある場合は重複チェック
    if (userData.email && userData.email !== existingUser.email) {
      const duplicateEmail = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (duplicateEmail) {
        throw new ApiError(400, 'このメールアドレスは既に使用されています');
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: userData,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
};

// ユーザーを削除
export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    
    // IDが有効な数値かチェック
    if (isNaN(id)) {
      throw new ApiError(400, '無効なID形式です');
    }
    
    // ユーザーの存在確認
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new ApiError(404, 'ユーザーが見つかりません');
    }

    // 関連する貸出レコードがある場合はエラー
    const activeLoans = await prisma.loan.count({
      where: {
        userId: id,
        returnedAt: null,
      },
    });

    if (activeLoans > 0) {
      throw new ApiError(400, '未返却の本があるユーザーは削除できません');
    }

    await prisma.user.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};