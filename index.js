'use strict';

const Hapi = require('hapi');
const pg = require('pg');
const req = require('request');
const config = require('./config');
const redis = require('redis');
const crypto = require('crypto');
const Boom = require('boom');
const fs = require('fs');
const path = require('path');

var client = new pg.Client();
var pool = new pg.Pool(config);

var redis_client = redis.createClient();

redis_client.on("error", function (err) {
    console.log("Error " + err);
});

const server = new Hapi.Server();
server.connection({
	port: 3000,
	/**tls: {
		key: fs.readFileSync(path.join(__dirname, 'tls/ssl/filmvault.pem'), 'utf8'),
		cert: fs.readFileSync(path.join(__dirname, 'tls/certs/filmvaultcert.pem'), 'utf8'),
		rejectUnauthorized: false
  	}**/
});

function genToken() {
	const hash = crypto.createHash('md5');
	var htoken;
	crypto.randomBytes(48, function(err, buffer) {
		var token = buffer.toString('hex');
		hash.update(token);
		htoken = hash.digest('hex');
		client.query('SELECT * FROM tokens WHERE token_hash = $1', [htoken], function(err, result) {
    		if(err) {
      			return console.error('error running query', err);
    		}
  			if(result.rows[0]) {
  				htoken = genToken();
  			}
  		});
		return htoken;
	});
}

//Hashes token, finds it in Redis and identifies user
function verify(token, username, callback) {
	const hash = crypto.createHash('md5');
 	var args = arguments;
 	var reply = args[4];
  	var ts = (new Date).getTime();
  	var htoken;
  	hash.update(token);
  	htoken = hash.digest('hex');
  	redis_client.get(htoken, function(err, replies) {
  		if(replies != NaN && replies > 15) {
  			return reply(Boom.tooManyRequests("You are making too many requests, please try again in a couple seconds."));
  		}
  		else {
  			var multi = redis_client.multi();
  			multi.incr(htoken, redis.print);
  			multi.expire(htoken, 10);
  			multi.exec(function(err, replies) {
  				pool.connect(function(err, client, done) {
					if(err) {
    					return console.error('error fetching client from pool', err);
  					}
  					client.query('SELECT username FROM tokens WHERE token_hash = $1', 
					  	[htoken], function(err, result) {
					    if(err) {
					      	return console.error('error running query', err);
					    }
				  		if(result.rows[0]) {
				  			callback(username, result.rows[0].username, args[3], args[4], args[5]);
				    	}
				    	else {
							return reply(Boom.unauthorized("Invalid Token Provided"));
						}
						done();
					});
  				});
  			});
  		}
 	});
}

//Checks if list exists, if not creates list using username and data in payload
function makeList(target, writer, payload, reply) {
  	var responseStr = "";
  	pool.connect(function(err, client, done) {
		if(err) {
	    	return console.error('error fetching client from pool', err);
	  	}
  		client.query('SELECT * FROM film_lists WHERE username = $1 AND list_name = $2', 
	  		[target, payload.listname], function(err, result) {
		    if(err) {
		      	return console.error('error running query', err);
		    }
		    if(target != writer) {
		    	return reply(Boom.forbidden('You do not have permission to modify ' + target + '\'s lists'));
		    }
	  		else if(result.rows[0]) {
	    		responseStr = "List " + payload.listname + " already exists";
	    	}
	    	else {
				client.query('INSERT INTO film_lists(username, list_name, imdb_ID) values($1, $2, $3)', 
					[target, payload.listname, payload.imdb_ID]);
				responseStr = payload.listname + " successfully created containing " + payload.imdb_ID;
			}
			reply(responseStr);
		});
		done();
  	});
}

function addFilm(target, writer, listname, payload, reply) {
	pool.connect(function(err, client, done) {
	  	if(err) {
	    	return console.error('error fetching client from pool', err);
	  	}
	  	if(target != writer) {
	  		return reply(Boom.forbidden('You do not have permission to modify ' + target + '\'s lists'));
	  	}
	  	else {
		  	client.query('SELECT * FROM film_lists WHERE username = $1 AND list_name = $2 AND imdb_ID = $3', 
		  		[username, listname, payload.imdb_ID], function(err, result) {
		    	if(err) {
		      		return console.error('error running query', err);
		    	}
		    	if(result.rows[0]) {
		    		responseStr = "Movie: " + payload.imdb_ID + " already exists in list " + listname;
		    	}
		    	else {
		    		client.query('INSERT INTO film_lists(username, list_name, imdb_ID) values($1, $2, $3)', 
						[username, listname, payload.imdb_ID]);
		    		return reply(imdb_ID + " successfully added to list " + listname);
		    	}
			});
		}
		done();
	});
}

function deleteList(target, username, listname, reply) {
	pool.connect(function(err, client, done) {
	  	if(err) {
	    	return console.error('error fetching client from pool', err);
	  	}
	  	if(target != writer) {
	  		done();
			return reply(Boom.forbidden('You do not have permission to modify ' + target + '\'s lists'));
		}
		else {
			client.query('DELETE FROM film_lists WHERE username = $1 AND list_name = $2', [username, listname]);
			reply("Film List " + listname + " Successfully Deleted");
			done();
		}
	});
}

function deleteFilm(target, writer, listname, movie, reply) {
	pool.connect(function(err, client, done) {
	  	if(err) {
	    	return console.error('error fetching client from pool', err);
	  	}
	  	if(target != writer) {
		    return reply(Boom.forbidden('You do not have permission to modify ' + target + '\'s lists'));
		}
		client.query('DELETE FROM film_lists WHERE username = $1 AND list_name = $2 AND imdb_ID = $3', [username, listname, imdb_ID]);
		reply("Film " + imdb_ID + " Successfully Deleted From " + listname);
		done();
	});
}

//Create a new user
server.route({
	method: 'POST',
	path: '/user',
	handler: function (request, reply) {
		const hash = crypto.createHash('md5');
		var payload = request.payload;
		var htoken;
		crypto.randomBytes(24, function(err, buffer) {
			var token = buffer.toString('hex');
			hash.update(token);
			htoken = hash.digest('hex');
			pool.connect(function(err, client, done) {
			  	if(err) {
			    	return console.error('error fetching client from pool', err);
			  	}
				client.query('SELECT * FROM tokens INNER JOIN users ON tokens.username=users.username WHERE users.username = $1 OR email = $2 OR token_hash = $3', 
					[payload.username, payload.email, htoken], function(err, result) {
		    		if(err) {
		      			return console.error('error running query', err);
		    		}
		  			if(result.rows[0]) {
		  				var data = result.rows[0]
		  				if(data.username == payload.username && data.email == payload.email) {
		  					return reply(Boom.conflict("Username and Email already in use. Please try another!"));
		  				}
		  				else if(data.username == payload.username) {
		  					return reply(Boom.conflict("Username already in use. Please try another!"));
		  				}
		  				else if(data.email == payload.email) {
		  					return reply(Boom.conflict("Email already in use. Please try another!"));
		  				}
		  				else if(data.token_hash == htoken) {
		  					htoken = genToken();
		  				}
		  			}
		  			else {
		  				client.query('INSERT INTO users(username, email) values($1, $2)', 
		  					[payload.username, payload.email]);
	  					client.query('INSERT INTO tokens(token_hash, username) values($1, $2)', 
	  						[htoken, payload.username]);
		  				return reply("Account created, check your email for your token!");
		  			}
		  			console.log(token);
		  			done();
	  			});
			});
		});
	}
});

//return user's film lists
//TODO Auth
server.route({
	method: 'GET',
	path: '/lists/{username}',
	handler: function (request, reply) {
		const username = encodeURIComponent(request.params.username);
		pool.connect(function(err, client, done) {
		  	if(err) {
		    	return console.error('error fetching client from pool', err);
		  	}
		  	client.query('SELECT list_name FROM film_lists WHERE username = $1 GROUP BY list_name', [username], function(err, result) {
		    	if(err) {
		      		return console.error('error running query', err);
		    	}
		    	reply(result.rows);
				done();
			});
		});
	}
});

//return films on user's film list {listname}
//TODO Auth
server.route({
	method: 'GET',
	path: '/lists/{username}/{listname}',
	handler: function (request, reply) {
		//TODO check redis
		const username = encodeURIComponent(request.params.username);
		const listname = encodeURIComponent(request.params.listname);
		pool.connect(function(err, client, done) {
		  	if(err) {
		    	return console.error('error fetching client from pool', err);
		  	}
		  	client.query('SELECT imdb_ID FROM film_lists WHERE username = $1 AND list_name = $2', [username, listname], function(err, result) {
		    	if(err) {
		      		return console.error('error running query', err);
		    	}
		    	reply(result.rows);
		    	done();
			});
		});
	}
});

//Create a new list {list_name} with entry {imdb_ID} from body
//Lists must have at least one entry to exist
server.route({
	method: 'POST',
	path: '/lists/{username}',
	handler: function (request, reply) {
		const authorization = request.query.token;
		console.log(authorization.length);
		const username = encodeURIComponent(request.params.username);
		var payload = request.payload;
		verify(authorization, username, makeList, payload, reply);
	}
});

//Add film to existing film list
server.route({
	method: 'PUT',
	path: '/lists/{username}/{listname}',
	handler: function(request, reply) {
		const username = encodeURIComponent(request.params.username);
		const listname = encodeURIComponent(request.params.listname);
		const authorization = request.query.token;
		var payload = request.payload;
		verify(authorization, username, addFilm, listname, payload, reply);
	}
});

server.route({
	method: 'DELETE',
	path: '/lists/{username}/{listname}/{imdb_ID}',
	handler: function(request, reply) {
		const username = encodeURIComponent(request.params.username);
		const listname = encodeURIComponent(request.params.listname);
		const imdb_ID = encodeURIComponent(request.params.imdb_ID);
		const authorization = request.query.token;
		verify(authorization, username, deleteFilm, listname, imdb_ID, reply);
	}
});

//Delete a film list
server.route({
	method: 'DELETE',
	path: '/lists/{username}/{listname}',
	handler: function(request, reply) {
		const username = encodeURIComponent(request.params.username);
		const listname = encodeURIComponent(request.params.listname);
		const authorization = request.query.token;
		verify(authorization, username, deleteList, listname, reply);
	}
});

//Given movie title and optionally the year return info from OMDb
server.route({
	method: 'GET',
	path: '/movie/{title}/{year?}',
	handler: function (request, reply) {
		const year = request.params.year ? encodeURIComponent(request.params.year) : '';
		const title = encodeURIComponent(request.params.title);
		var reqString = 'https://www.omdbapi.com/?t=' + title + '/' + year;
		req(reqString, function (error, response, body) {
			if (!error && response.statusCode == 200) {
    			reply(body);
  			}
		});
	}
});

server.register({
  	register: require('hapi-require-https'),
  	options: {}
});

server.start((err) => {

    if (err) {
        throw err;
    }
    console.log('Server running at:', server.info.uri);
});

