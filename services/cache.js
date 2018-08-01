const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');

const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
//creates a promise out of the response from the redis.hget method
client.hget = util.promisify(client.hget);
//store the exec function prior to altering it
const exec = mongoose.Query.prototype.exec;

//adds a new method onto the Query constructor which will be looked up by any Query instances
//the options object passed in will contain the highlevel key that will be used to clear a portion of the Redis cache.
mongoose.Query.prototype.cache = function(options = {}) {
  //"this" refers to the query instance, so it sets a property on the Query instance with a name of useCache and a value of true
  this.useCache = true;
  //creates a highlevel key that can be used to clear out certain records in Redis based off of a commmon feature, such as a User ID. So all blogs, comments, and etc. that were casched by that user, can be uncached when that user updates, or adds to one of those records
  this.hashKey = JSON.stringify(options.key || '');
  //We return the "this" keyword, a reference to the Query instance, to allow this new method to be chained
  return this;
}

mongoose.Query.prototype.exec = async function () {

  //checks to see if the useCache property is set to false, or undefined, if so it will not cache the result of the  Query into the Redis DB, and will instead invoke the exec method with the passed in args
  if(!this.useCache) {
    return exec.apply(this, arguments);
  }
  //invokes the getQuery method on the passed in Query which returns a query object, then that is copied over to the empty target object, and finally the collection property is added on to the target object which contains the collection name
  //combining the collection name and the query object create a unique key to use with Redis
  const key = JSON.stringify(Object.assign({}, this.getQuery(), { collection: this. mongooseCollection.name }));

  //checks the Redis cache to see if there is a matching key in there
  const cacheValue = await client.hget(this.hashKey, key);
  //If there is a matching key
  if(cacheValue) {

    const doc = JSON.parse(cacheValue);

    //checks if the response is an array
    //if it is an array, then we have to convert each parsed object into a model instance, so we iterate throuh the array creating a model instance out of each index, this is referred to as hydrating the values
    //this.model is a reference to the model that the original query is attached to
    //We use the new keyword to create a new instance of that model, and then we pass in the parsed JSON that was returned by redis
    //We have to do this because the application expects the .exec( ) method to return a model instance and not just an object, that instance needs to have methods attached to it for Mongoose to invoke.
    //if it is just a single object, then it just gets converted to a model instance, and returned
    return Array.isArray(doc)
      ?  doc.map(d => new this.model(d))
      : new this.model(doc);
  }

  //Returns the result of the original exec function, by invoking that function, and passing it the arguments passed into our new exec function
  const result = await exec.apply(this, arguments);

  //3rd arg is the expiration flag, 4th arg is the number of seconds the cache will hold the result before it is expired and the memory space is freed up
  client.hset(this.hashKey, key, JSON.stringify(result), 'EX', 10);

  return result;
}

module.exports = {
  clearHash(hashKey) {
    //clears out any record in redis that has this key
    client.del(JSON.stringify(hashKey))
  }
}
