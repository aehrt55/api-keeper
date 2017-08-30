const zlib = require('zlib');
const crypto = require('crypto');
const express = require('express');
const bodyParser = require('body-parser');
const httpProxy = require('http-proxy');
const mongoose = require('mongoose');
const handlers = require('./handlers');
const onEnd = handlers.onEnd;
const onFind = handlers.onFind;

const mongoHost = process.env.MONGO_HOST;
mongoose.connect(`mongodb://${mongoHost}/api_keeper`);

const ApiResultSchema = new mongoose.Schema({
  hashedKey: String,
  endpoint: String,
  reqBody: Object,
  resBody: Object,
  version: String,
}, {
  timestamps: true,
});

const ApiResult = mongoose.model('ApiResult', ApiResultSchema);

const getHashedKey = ({ endpoint, reqBody }) => crypto
.createHmac('sha256', endpoint)
.update(JSON.stringify(reqBody))
.digest('hex');

const appMode = process.env.APP_MODE || 'proxy';
const proxyTarget = process.env.PROXY_TARGET || 'http://localhost:3020';
const version = process.env.API_VERSION || undefined;

const app = express();
app.use(bodyParser.json());

if (appMode === 'proxy') {
  const proxy = httpProxy.createProxyServer({});
  proxy.on('proxyReq', function(proxyReq, req, res, options) {
    if(req.body) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type','application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(Buffer.from(bodyData));
    }
  });

  proxy.on('proxyRes', function(proxyRes, req, res) {
    if (proxyRes.statusCode !== 200) {
      return;
    }
    const body = [];
    proxyRes.on('data' , function(dataBuffer) {
      body.push(dataBuffer);
    });
    proxyRes.on('end' , function() {
      const reqBody = req.body;
      let resBody = Buffer.concat(body);
      if (proxyRes.headers['content-encoding'] === 'gzip') {
        resBody = zlib.unzipSync(resBody);
      } else {
        resBody = resBody.toString();
      }
      if (!resBody) {
        return;
      }
      try {
        resBody = JSON.parse(resBody);
      } catch (e) {
        console.error(e);
      }
      const hashedKey = getHashedKey({ endpoint: req.url, reqBody });
      onEnd({
        version,
        hashedKey,
        reqBody,
        resBody,
        endpoint: req.url,
      }, result => ApiResult.create(result));
    });
  });

  proxy.on('error', (err, req, res) => {
    console.error(err);
    res.json({
      error: err,
    });
  });

  app.use((req, res) => {
    proxy.web(req, res, {
      target: proxyTarget,
    });
  });
} else if (appMode === 'mock') {
  app.use((req, res) => {
    const reqBody = req.body;
    const endpoint = req.url;
    const hashedKey = getHashedKey({ reqBody, endpoint });
    const findCondition = { hashedKey };
    if (version) {
      findCondition.version = version;
    }
    ApiResult.findOne(findCondition)
    .sort([['createdAt', 'descending']])
    .exec((err, doc) => {
      onFind({ err, doc }, result => res.json(result));
    });
  });
}

app.listen(3000, () => console.log('server start'));
