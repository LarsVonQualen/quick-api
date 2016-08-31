# Quick Api lol

Welcome to this very simple file based key value store.

The idea is simple. Normal CRUD api, but where the entity is a bucket name.

For now it will only support JSON in and out, no primitives, as in i haven't tested that yet..

# The Api

`GET /:bucket/?page=0&pageSize=10&sort=title`

`GET /:bucket/:objectId`

`PUT /:bucket/:objectId`

`DELETE /:bucket/:objectId`

`POST /:bucket`

# Future use

## Installation

`npm install --save quick-api`

## Usage

```javascript
const QuickApi = require('quick-api');
const server = new QuickApi('./buckets', 3000);
server.start()
    .then(() => server.log.info('Well hello there world!'));
```