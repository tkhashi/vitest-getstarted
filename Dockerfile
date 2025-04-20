FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl
RUN apk update && apk upgrade openssl

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]