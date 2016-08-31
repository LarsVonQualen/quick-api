'use strict';

const express = require('express');
const _ = require('lodash');
const winston = require('winston');
const expressWinston = require('express-winston');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const bodyParser = require('body-parser');
const sanitize = require("sanitize-filename");
const uuid = require('uuid');

class QuickApi {
    constructor(bucketPath, port) {
        this.bucketPath = path.resolve(__dirname, bucketPath || './buckets/');
        this.port = port || 3000;
        this.app = express();
        this.log = winston;
        this.buckets = {};
    }

    start() {
        this.app.use(bodyParser.json());

        this.setupLogging()
            .then(() => this.createRoutes())
            .then(() => this.loadBuckets())
            .then(() => this.app.listen(this.port, () => this.log.info(`Listening on port ${this.port} with buckets located in '${this.bucketPath}'`)))
            .catch(error => this.log.error(error));
    }

    setupLogging() {
        this.log.info('Setting up request logging');

        this.app.use(expressWinston.logger({
            winstonInstance: this.log,
            meta: true, // optional: control whether you want to log the meta data about the request (default to true) 
            msg: "HTTP {{req.method}} {{req.url}}", // optional: customize the default logging message. E.g. "{{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}" 
            expressFormat: true, // Use the default Express/morgan request formatting. Enabling this will override any msg if true. Will only output colors with colorize set to true 
            colorize: true, // Color the text and status code, using the Express/morgan color palette (text: gray, status: default green, 3XX cyan, 4XX yellow, 5XX red).  
        }));

        return Promise.resolve(null);
    }

    loadBuckets(onComplete, onError) {
        this.log.info('Looking up existing buckets');
        
        return this.getBucketFiles()
            .map(file => path.resolve(this.bucketPath, file))
            .map(file => fs.readFileAsync(file, 'utf8')
                .then(contents => this.addBucket(file, contents)));
    }

    getBucketFiles() {
        return fs.accessAsync(this.bucketPath)
            .catch(() => fs.mkdirAsync(this.bucketPath))
            .then(() => fs.readdirAsync(this.bucketPath))
            .catch(error => this.log.error(error));
    }

    createRoutes() {
        this.log.info('Creating routes');

        this.app.get('/', (req, res) => res.status(200).send('Hello World!'));
        this.app.get('/:bucket', (req, res) => this.handleRequest(req, res, this.getPageFromBucket(req.params.bucket, req.query.sort, req.query.page, req.query.pageSize)));
        this.app.get('/:bucket/:objectId', (req, res) => this.handleRequest(req, res, this.getValueFromBucket(req.params.bucket, req.params.objectId)));
        this.app.put('/:bucket/:objectId', (req, res) => this.handleRequest(req, res, this.updateValueInBucket(req.params.bucket, req.params.objectId, req.body)));
        this.app.post('/:bucket', (req, res) => this.handleRequest(req, res, this.createValueInBucket(req.params.bucket, req.body)));
        this.app.delete('/:bucket/:objectId', (req, res) => this.handleRequest(req, res, this.removeValueInBucket(req.params.bucket, req.params.objectId)));

        return Promise.resolve(null);
    }

    handleRequest(req, res, actionPromise) {
        actionPromise.then(result => res.json(result))
            .catch(error => {
                this.log.error(error);
                res.status(500).json(error.message);
            });
    }

    addBucket(file, contents) {
        const bucketKey = path.basename(file, '.json');
        
        try {
            this.buckets[bucketKey] = JSON.parse(contents);
        } catch (e) {
            return Promise.reject(e);
        }

        return Promise.resolve(null);
    }

    getValueFromBucket(bucket, key) {
        return this.assertValueExists(bucket, key).then(() => this.buckets[bucket][key]);
    }

    getPageFromBucket(bucket, sortBy, page, pageSize) {
        return this.assertBucketExists(bucket).then(() => {
            const sort = sortBy || '__objectId';
            const p = parseInt(page) || 0;
            const size = parseInt(pageSize) || Object.keys(this.buckets[bucket]).length;
            const fromIndex = p * size;
            const toIndex = fromIndex + size;

            return Promise.resolve(Object.keys(this.buckets[bucket]))
                .map(key => this.buckets[bucket][key])
                .then(values => _.sortBy(values, sortBy))
                .then(values => values.slice(fromIndex, toIndex));
        });
    }

    updateValueInBucket(bucket, key, value) {
        const originalValue = value;

        return this.assertValueExists(bucket, key)
            .then(() => Promise.resolve(Object.keys(value))
                .filter(objectKey => objectKey !== '__objectId')
                .filter(objectKey => this.buckets[bucket][key][objectKey] !== value[objectKey])
                .each(objectKey => this.buckets[bucket][key][objectKey] = value[objectKey]))
            .then(() => this.saveBucket(bucket))
            .then(() => originalValue);
    }

    createValueInBucket(bucket, value) {
        return this.assertBucketExists(bucket)
            .tap(() => this.generateId().then(id => value.__objectId = id))
            .tap(() => this.buckets[bucket][value.__objectId] = value)
            .then(() => this.saveBucket(bucket))
            .then(() => value);
    }

    removeValueInBucket(bucket, key) {
        return this.assertValueExists(bucket, key)
            .then(() => delete this.buckets[bucket][key])
            .then(() => this.saveBucket(bucket))
            .then(() => true);
    }

    assertBucketExists(bucket) {
        if (this.buckets[bucket] === undefined) {
            this.buckets[bucket] = {};

            return this.saveBucket(bucket);
        }

        return Promise.resolve(null);
    }

    assertValueExists(bucket, key) {
        return this.assertBucketExists(bucket).then(() => {
            if (this.buckets[bucket][key] === undefined) {
                return Promise.reject(new Error('Unknown key'));
            }

            return Promise.resolve(null);
        });
    }

    saveBucket(bucket) {
        const filename = `${bucket}.json`;
        const safeFilename = sanitize(filename);
        const contents = JSON.stringify(this.buckets[bucket]);

        return fs.writeFileAsync(path.resolve(this.bucketPath, safeFilename), contents, 'utf8');
    }

    generateId() {
        return Promise.resolve(uuid.v4());
    }
}

module.exports = QuickApi;