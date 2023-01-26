FROM node:10-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY src ./src
COPY public ./public
COPY migrations_old ./migrations_old
COPY migrate-mongo-config.js .

RUN apk add --update alpine-sdk
RUN apk add git python3
RUN echo -e '[url "https://github.com/"]\n  insteadOf = "git://github.com/"' >> ~/.gitconfig
RUN npm ci
RUN npm i -g pm2
RUN npm i -g migrate-mongo@8.1.4
CMD migrate-mongo up && pm2-runtime start ./src/index.js
EXPOSE 3030
