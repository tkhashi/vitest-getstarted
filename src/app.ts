import express, { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import YAML from 'yaml';
import { PrismaClient } from '@prisma/client';
import { errorHandler } from './middlewares/errorHandler';

// ルーターのインポート
import userRouter from './routes/userRoutes';
import bookRouter from './routes/bookRoutes';
import authorRouter from './routes/authorRoutes';
import categoryRouter from './routes/categoryRoutes';
import loanRouter from './routes/loanRoutes';

// Prismaクライアントのグローバルインスタンス
export const prisma = new PrismaClient();

const app: Express = express();

// ミドルウェアの設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OpenAPIドキュメントの設定
const openApiPath = './src/swagger/openapi.yaml';
if (fs.existsSync(openApiPath)) {
  const file = fs.readFileSync(openApiPath, 'utf8');
  const swaggerDocument = YAML.parse(file);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// ルートの設定
app.use('/api/users', userRouter);
app.use('/api/books', bookRouter);
app.use('/api/authors', authorRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/loans', loanRouter);

// ヘルスチェック用のエンドポイント
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// エラーハンドリングミドルウェア
app.use(errorHandler);

export default app;