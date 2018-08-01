const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');

const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
client.get = util.promisify(client.get);

//store the exec function prior to altering it
const exec = mongoose.Query.prototype.exec;


mongoose.Query.prototype.exec = async function () {



  //invokes the getQuery method on the passed in Query which returns a query object, then that is copied over to the empty target object, and finally the collection property is added on to the target object which contains the collection name
  //combining the collection name and the query object create a unique key to use with Redis
  const key = JSON.stringify(Object.assign({}, this.getQuery(), { collection: this. mongooseCollection.name }));

  //checks the Redis cache to see if there is a matching key in there
  const cacheValue = await client.get(key);
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

  client.set(key, JSON.stringify(result));

  return result;
}
