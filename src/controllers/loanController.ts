import { Request, Response, NextFunction } from 'express';
import { prisma } from '../app';
import { CreateLoanDto, UpdateLoanDto, ApiError } from '../types';

// すべての貸出情報を取得
export const getAllLoans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const activeOnly = req.query.active === 'true';

    // アクティブな貸出のみのフィルター
    const where = activeOnly ? { returnedAt: null } : {};

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          book: {
            include: {
              author: true,
            },
          },
        },
        orderBy: {
          borrowedAt: 'desc',
        },
      }),
      prisma.loan.count({ where }),
    ]);

    res.json({
      data: loans,
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

// 特定の貸出情報を取得
export const getLoanById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const loan = await prisma.loan.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        book: {
          include: {
            author: true,
          },
        },
      },
    });

    if (!loan) {
      throw new ApiError(404, '貸出情報が見つかりません');
    }

    res.json(loan);
  } catch (error) {
    next(error);
  }
};

// 新しい貸出を作成（本を借りる）
export const createLoan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const loanData: CreateLoanDto = req.body;
    
    // ユーザーの存在確認
    const user = await prisma.user.findUnique({
      where: { id: loanData.userId },
    });

    if (!user) {
      throw new ApiError(404, 'ユーザーが見つかりません');
    }

    // 本の存在確認と利用可能性チェック
    const book = await prisma.book.findUnique({
      where: { id: loanData.bookId },
    });

    if (!book) {
      throw new ApiError(404, '本が見つかりません');
    }

    if (book.available <= 0) {
      throw new ApiError(400, 'この本は現在利用できません');
    }

    // トランザクションを使用して貸出の作成と本の利用可能数の更新
    const newLoan = await prisma.$transaction(async (tx) => {
      // 本の利用可能数を減らす
      await tx.book.update({
        where: { id: loanData.bookId },
        data: {
          available: {
            decrement: 1
          }
        }
      });

      // 貸出を作成
      return tx.loan.create({
        data: loanData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          book: {
            include: {
              author: true,
            },
          },
        },
      });
    });

    res.status(201).json(newLoan);
  } catch (error) {
    next(error);
  }
};

// 貸出情報を更新（本を返却など）
export const updateLoan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const loanData: UpdateLoanDto = req.body;

    // 貸出の存在確認
    const existingLoan = await prisma.loan.findUnique({
      where: { id },
    });

    if (!existingLoan) {
      throw new ApiError(404, '貸出情報が見つかりません');
    }

    // トランザクションを使用して貸出の更新と本の利用可能数の更新
    const updatedLoan = await prisma.$transaction(async (tx) => {
      // 返却の場合は本の利用可能数を増やす
      if (loanData.returnedAt && !existingLoan.returnedAt) {
        await tx.book.update({
          where: { id: existingLoan.bookId },
          data: {
            available: {
              increment: 1
            }
          }
        });
      }
      // 返却取り消しの場合は本の利用可能数を減らす
      else if (existingLoan.returnedAt && loanData.returnedAt === null) {
        const book = await tx.book.findUnique({
          where: { id: existingLoan.bookId },
        });

        if (book && book.available <= 0) {
          throw new ApiError(400, 'この本は現在利用できません');
        }

        await tx.book.update({
          where: { id: existingLoan.bookId },
          data: {
            available: {
              decrement: 1
            }
          }
        });
      }

      // 貸出を更新
      return tx.loan.update({
        where: { id },
        data: loanData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          book: {
            include: {
              author: true,
            },
          },
        },
      });
    });

    res.json(updatedLoan);
  } catch (error) {
    next(error);
  }
};

// 貸出情報を削除
export const deleteLoan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    
    // 貸出の存在確認
    const existingLoan = await prisma.loan.findUnique({
      where: { id },
    });

    if (!existingLoan) {
      throw new ApiError(404, '貸出情報が見つかりません');
    }

    // 未返却の貸出は削除不可
    if (!existingLoan.returnedAt) {
      throw new ApiError(400, '未返却の貸出は削除できません');
    }

    await prisma.loan.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};