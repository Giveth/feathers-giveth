FROM node:10-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY src ./src
COPY public ./public
COPY migrations ./migrations
COPY migrate-mongo-config.js .

RUN apk add --update alpine-sdk
RUN apk add git python3
RUN npm ci
RUN npm i -g pm2
RUN npm i -g migrate-mongo
CMD migrate-mongo up && pm2-runtime start ./src/index.js
EXPOSE 3030