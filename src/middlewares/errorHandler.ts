import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../types';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      message: err.message,
    });
  }

  // Prismaのエラーハンドリング
  if (err.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({
      message: 'データベースエラーが発生しました',
      error: process.env.NODE_ENV === 'production' ? undefined : err,
    });
  }

  // 未知のエラーの場合
  return res.status(500).json({
    message: '予期せぬエラーが発生しました',
    error: process.env.NODE_ENV === 'production' ? undefined : err,
  });
};