FROM node:8

ENV PROXY_TARGET http://127.0.0.1:3020

ENV APP_MODE proxy

WORKDIR /usr/src/app

COPY package.json .

RUN yarn

COPY . .

EXPOSE 3000

CMD ["yarn", "start"]
