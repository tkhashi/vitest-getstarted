import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 既存のデータを削除
  await prisma.loan.deleteMany({});
  await prisma.bookCategory.deleteMany({});
  await prisma.book.deleteMany({});
  await prisma.author.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.user.deleteMany({});

  // カテゴリの作成
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: '小説',
        description: '物語や小説',
      },
    }),
    prisma.category.create({
      data: {
        name: '技術書',
        description: 'プログラミングや技術に関する書籍',
      },
    }),
    prisma.category.create({
      data: {
        name: '歴史',
        description: '歴史関連の書籍',
      },
    }),
  ]);

  // 著者の作成
  const authors = await Promise.all([
    prisma.author.create({
      data: {
        name: '村上春樹',
        bio: '日本の小説家',
      },
    }),
    prisma.author.create({
      data: {
        name: 'Robert C. Martin',
        bio: 'アメリカのソフトウェアエンジニア',
      },
    }),
    prisma.author.create({
      data: {
        name: '司馬遼太郎',
        bio: '日本の小説家、歴史作家',
      },
    }),
  ]);

  // 本の作成
  const books = await Promise.all([
    prisma.book.create({
      data: {
        title: '1Q84',
        isbn: '9784103534204',
        description: '架空の1984年を舞台にしたファンタジー小説',
        published: new Date('2009-05-29'),
        quantity: 5,
        available: 5,
        authorId: authors[0].id,
      },
    }),
    prisma.book.create({
      data: {
        title: 'Clean Code',
        isbn: '9780132350884',
        description: 'ソフトウェア開発における良いコードの書き方',
        published: new Date('2008-08-01'),
        quantity: 3,
        available: 3,
        authorId: authors[1].id,
      },
    }),
    prisma.book.create({
      data: {
        title: '坂の上の雲',
        isbn: '9784167105075',
        description: '明治時代を描いた歴史小説',
        published: new Date('1969-09-01'),
        quantity: 2,
        available: 2,
        authorId: authors[2].id,
      },
    }),
  ]);

  // 本とカテゴリの関連付け
  await Promise.all([
    prisma.bookCategory.create({
      data: {
        bookId: books[0].id,
        categoryId: categories[0].id,
      },
    }),
    prisma.bookCategory.create({
      data: {
        bookId: books[1].id,
        categoryId: categories[1].id,
      },
    }),
    prisma.bookCategory.create({
      data: {
        bookId: books[2].id,
        categoryId: categories[0].id,
      },
    }),
    prisma.bookCategory.create({
      data: {
        bookId: books[2].id,
        categoryId: categories[2].id,
      },
    }),
  ]);

  // ユーザーの作成
  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: '佐藤太郎',
        email: 'taro@example.com',
        password: 'password123', // 実際のアプリではハッシュ化する
      },
    }),
    prisma.user.create({
      data: {
        name: '鈴木花子',
        email: 'hanako@example.com',
        password: 'password123',
      },
    }),
  ]);

  // 貸出の作成
  await Promise.all([
    prisma.loan.create({
      data: {
        userId: users[0].id,
        bookId: books[0].id,
        borrowedAt: new Date('2023-01-01'),
        dueDate: new Date('2023-01-15'),
        returnedAt: new Date('2023-01-10'),
      },
    }),
    prisma.loan.create({
      data: {
        userId: users[1].id,
        bookId: books[1].id,
        borrowedAt: new Date('2023-02-01'),
        dueDate: new Date('2023-02-15'),
        // returnedAtがnullの場合は、まだ返却されていない
      },
    }),
  ]);

  console.log('シードデータの作成が完了しました');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });