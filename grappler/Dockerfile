FROM node:9.4.0-alpine

WORKDIR /grappler

COPY package.json yarn.lock ./

RUN yarn

COPY . .
