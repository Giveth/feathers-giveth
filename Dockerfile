FROM node:10-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY src ./src
COPY public ./public
COPY migrations ./migrations
COPY migrate-mongo-config.js .

RUN ls
RUN apk add git python3
RUN apk add --update alpine-sdk
RUN npm ci --only=production
#COPY config ./config
RUN rm -rf config
RUN ls
CMD  ls  && ls config && cat config/default.json &&  ./node_modules/.bin/migrate-mongo up && ./node_modules/.bin/pm2-runtime start ./src/index.js
EXPOSE 3030
