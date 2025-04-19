import { User, Book, Author, Category, Loan } from '@prisma/client';

// ページネーションのレスポンス型
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// クエリパラメータの型
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// 作成・更新用のDTO型
export type CreateUserDto = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateUserDto = Partial<CreateUserDto>;

export type CreateBookDto = Omit<Book, 'id' | 'createdAt' | 'updatedAt'> & {
  categoryIds: number[];
};
export type UpdateBookDto = Partial<Omit<CreateBookDto, 'authorId'> & { authorId?: number }>;

export type CreateAuthorDto = Omit<Author, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateAuthorDto = Partial<CreateAuthorDto>;

export type CreateCategoryDto = Omit<Category, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateCategoryDto = Partial<CreateCategoryDto>;

export type CreateLoanDto = {
  userId: number;
  bookId: number;
  dueDate: Date;
};

export type UpdateLoanDto = {
  returnedAt?: Date;
};

// エラー型
export class ApiError extends Error {
  statusCode: number;
  
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}