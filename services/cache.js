const mongoose = require("mongoose");
const redis = require("redis");
const util = require("util");
const keys = require("../config/keys");

//default redis url
// const redisUrl = "redis://127.0.0.1:6379";

const client = redis.createClient(keys.redisUrl);
client.hget = util.promisify(client.hget);
const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function(options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || "default");

  return this;
};

mongoose.Query.prototype.exec = async function() {
  // this references the current query we are executing
  // example: Blog.find()
  // console.log(this.getQuery());
  // console.log(this.mongooseCollection.name);

  if (!this.useCache) {
    return exec.apply(this, arguments);
  }

  //Object.sssigncreates a new object by
  //merging other values into a new object
  const key = JSON.stringify(
    Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name
    })
  );

  // See if we have a vlaue for 'key' in Redis
  const cacheValue = await client.hget(this.hashKey, key);

  // If we do, return that
  if (cacheValue) {
    // checking how to send back a mongoose model
    // console.log(this);

    const doc = JSON.parse(cacheValue);

    return Array.isArray(doc)
      ? doc.map(d => new this.model(d))
      : new this.model(doc);
  }

  // Otherwise, issue the query and store the result in redis
  const result = await exec.apply(this, arguments);

  // 'EX' is for expiration, setting it for 10 seconds
  client.hset(this.hashKey, key, JSON.stringify(result), "EX", 10);

  return result;
};

module.exports = {
  //deletes users cached data
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey));
  }
};
