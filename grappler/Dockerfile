FROM node:12.6.0-alpine

WORKDIR /grappler

COPY package.json yarn.lock ./

RUN yarn

COPY . .
