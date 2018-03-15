FROM node:9.4.0-alpine

WORKDIR /deflector

ADD https://s3-us-west-2.amazonaws.com/therearefourlights/lambda.zip /tmp

COPY package.json yarn.lock ./

RUN mkdir /tmp/lambda && \
    unzip -d /tmp/lambda /tmp/lambda.zip && \
    adduser -u 1337 -D -H -s /sbin/nologin executioner && \
    yarn

COPY . .
