import { describe, beforeEach, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../../src/middlewares/errorHandler';
import { ApiError } from '../../../src/types'

describe('エラーハンドラーミドルウェア', () => {
  // モックオブジェクト
  const req = {} as Request;
  let res: any;
  const next = vi.fn()

  beforeEach(() => {
    // レスポンスオブジェクトのモック
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it('ApiErrorが渡された場合、対応するステータスコードとメッセージを返す', () => {
    const error = new ApiError(404, 'リソースが見つかりません');
    
    errorHandler(error, req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: 'リソースが見つかりません',
    });
  });

  it('Prismaエラーが渡された場合、400ステータスコードを返す', () => {
    const error = new Error('Prismaエラー');
    error.name = 'PrismaClientKnownRequestError';
    
    errorHandler(error, req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
  });

  it('未知のエラーが渡された場合、500ステータスコードを返す', () => {
    const error = new Error('予期せぬエラー');
    
    errorHandler(error, req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });
});