FROM node:10-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY src ./src
COPY public ./public
COPY migrations ./migrations
COPY migrate-mongo-config.js .

RUN apk add --update alpine-sdk
RUN apk add git python3
RUN npm ci --only=production
RUN npm i -g pm2
CMD pm2-runtime start ./src/index.js
EXPOSE 3030
