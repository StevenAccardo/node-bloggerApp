const { clearHash } = require('../services/cache');

module.exports = async (req, res, next) => {
  //This is a little trick for being able to run a middleware after a route handler. By making the next() function a promise, we invoke it, and we wait for the request handler to complete, at which time execution will be returned to this spot, allowing us to clear the cache AFTER a succesful blog posting.
  await next();

  clearHash(req.user.id);
}
