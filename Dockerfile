FROM node:16.13.1-alpine

RUN mkdir -p /code
WORKDIR /code
ADD . /code

RUN apk add --no-cache --virtual python alpine-sdk
RUN yarn --frozen-lockfile
CMD ["yarn", "server:dev"]
EXPOSE 3001