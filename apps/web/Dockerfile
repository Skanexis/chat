FROM node:22-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile --filter @phantom-lab/web...

COPY apps/web apps/web

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/v1
ARG NEXT_PUBLIC_CHAT_ID=main
ARG NEXT_PUBLIC_DEV_INIT_DATA=user=%7B%22id%22%3A990001%2C%22username%22%3A%22web_dev%22%2C%22first_name%22%3A%22Web%22%7D

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_CHAT_ID=$NEXT_PUBLIC_CHAT_ID
ENV NEXT_PUBLIC_DEV_INIT_DATA=$NEXT_PUBLIC_DEV_INIT_DATA
ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app/apps/web

RUN pnpm build

EXPOSE 3001

CMD ["pnpm", "start"]
