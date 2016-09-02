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

let client = new pg.Client();
let pool = new pg.Pool(config);

let redis_client = redis.createClient();

redis_client.on("error", function (err) {
    console.log("Error " + err);
});

const server = new Hapi.Server();
server.connection({
	port: 3000,
	tls: {
		key: fs.readFileSync(path.join(__dirname, 'filmvault.key'), 'utf8'),
		cert: fs.readFileSync(path.join(__dirname, 'filmvault.crt'), 'utf8'),
		rejectUnauthorized: false
  	}
});

function genToken() {
	const hash = crypto.createHash('md5');
	let htoken;
	crypto.randomBytes(48, function(err, buffer) {
		let token = buffer.toString('hex');
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
function verify(token, username, reply, callback) {
	const hash = crypto.createHash('md5');
 	let args = arguments;
  	let ts = (new Date).getTime();
  	let htoken;
  	hash.update(token);
  	htoken = hash.digest('hex');
  	redis_client.get(htoken, function(err, replies) {
  		if(replies != NaN && replies > 15) {
  			return reply(Boom.tooManyRequests("You are making too many requests, please try again in a couple seconds."));
  		}
  		else {
  			let multi = redis_client.multi();
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
				  			callback(username, result.rows[0].username, reply, args[4], args[5]);
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
function makeList(target, writer, reply, payload) {
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
	    		return reply(Boom.conflict("List " + payload.listname + " already exists"));
	    	}
	    	else {
				client.query('INSERT INTO film_lists(username, list_name, imdb_ID) values($1, $2, $3)', 
					[target, payload.listname, payload.imdb_ID]);
				let respMsg = payload.listname + " successfully created containing " + payload.imdb_ID;
				return reply({"message": respMsg});
			}
		});
		done();
  	});
}

function addFilm(target, writer, reply, listname, imdb_ID) {
	pool.connect(function(err, client, done) {
	  	if(err) {
	    	return console.error('error fetching client from pool', err);
	  	}
	  	if(target != writer) {
	  		return reply(Boom.forbidden('You do not have permission to modify ' + target + '\'s lists'));
	  	}
	  	else {
		  	client.query('SELECT * FROM film_lists WHERE username = $1 AND list_name = $2 AND imdb_ID = $3', 
		  		[target, listname, imdb_ID], function(err, result) {
		    	if(err) {
		      		return console.error('error running query', err);
		    	}
		    	if(result.rows[0]) {
		    		return reply(Boom.conflict("Movie: " + imdb_ID + " already exists in list " + listname));
		    	}
		    	else {
		    		client.query('INSERT INTO film_lists(username, list_name, imdb_ID) values($1, $2, $3)', 
						[target, listname, imdb_ID]);
		    		let respMsg = imdb_ID + " successfully added to list " + listname;
		    		return reply({"message": respMsg});
		    	}
			});
		}
		done();
	});
}

function deleteList(target, writer, reply, listname) {
	pool.connect(function(err, client, done) {
	  	if(err) {
	    	return console.error('error fetching client from pool', err);
	  	}
	  	if(target != writer) {
	  		done();
			return reply(Boom.forbidden('You do not have permission to modify ' + target + '\'s lists'));
		}
		else {
			client.query('DELETE FROM film_lists WHERE username = $1 AND list_name = $2', [target, listname]);
			let respMsg = "Film List " + listname + " Successfully Deleted";
			return reply({"message": respMsg});
			done();
		}
	});
}

function deleteFilm(target, writer, reply, listname, imdb_ID) {
	pool.connect(function(err, client, done) {
	  	if(err) {
	    	return console.error('error fetching client from pool', err);
	  	}
	  	if(target != writer) {
		    return reply(Boom.forbidden('You do not have permission to modify ' + target + '\'s lists'));
		}
		client.query('DELETE FROM film_lists WHERE username = $1 AND list_name = $2 AND imdb_ID = $3', [target, listname, imdb_ID]);
		let respMsg = "Film " + imdb_ID + " Successfully Deleted From " + listname;
		return reply({"message": respMsg});
		done();
	});
}

//Create a new user
server.route({
	method: 'POST',
	path: '/users',
	handler: function (request, reply) {
		const hash = crypto.createHash('md5');
		let payload = request.payload;
		let htoken;
		crypto.randomBytes(24, function(err, buffer) {
			let token = buffer.toString('hex');
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
		  				let data = result.rows[0]
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
	  					return reply({
		  					message: "User and token created successfully, please store your token safely as it cannot be recovered",
		  					token: token
		  				});
		  			}
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
	path: '/users/{username}/lists',
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
		    	reply({"lists": result.rows});
				done();
			});
		});
	}
});

//return films on user's film list {listname}
//TODO Auth
server.route({
	method: 'GET',
	path: '/users/{username}/lists/{listname}',
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
		    	if(result.rows.length < 1) {
		    		return reply(Boom.notFound("List not found"));
		    	}
		    	return reply({"films": result.rows});
		    	done();
			});
		});
	}
});

//Create a new list {list_name} with entry {imdb_ID} from body
//Lists must have at least one entry to exist
server.route({
	method: 'POST',
	path: '/users/{username}/lists',
	handler: function (request, reply) {
		const authorization = request.query.token;
		const username = encodeURIComponent(request.params.username);
		let payload = request.payload;
		verify(authorization, username, reply, makeList, payload);
	}
});

//Add film to existing film list
server.route({
	method: 'PUT',
	path: '/users/{username}/lists/{listname}',
	handler: function(request, reply) {
		const username = encodeURIComponent(request.params.username);
		const listname = encodeURIComponent(request.params.listname);
		const imdb_ID = request.query.imdb_ID;
		const authorization = request.query.token;
		verify(authorization, username, reply, addFilm, listname, imdb_ID);
	}
}); 

//Delete a film from a film list
server.route({
	method: 'DELETE',
	path: '/users/{username}/lists/{listname}/{imdb_ID}',
	handler: function(request, reply) {
		const username = encodeURIComponent(request.params.username);
		const listname = encodeURIComponent(request.params.listname);
		const imdb_ID = encodeURIComponent(request.params.imdb_ID);
		const authorization = request.query.token;
		verify(authorization, username, reply, deleteFilm, listname, imdb_ID);
	}
});

//Delete a film list
server.route({
	method: 'DELETE',
	path: '/users/{username}/lists/{listname}',
	handler: function(request, reply) {
		const username = encodeURIComponent(request.params.username);
		const listname = encodeURIComponent(request.params.listname);
		const authorization = request.query.token;
		verify(authorization, username, reply, deleteList, listname);
	}
});

//Given movie title and optionally the year return info from OMDb
server.route({
	method: 'GET',
	path: '/movie/{title}/{year?}',
	handler: function (request, reply) {
		const year = request.params.year ? encodeURIComponent(request.params.year) : '';
		const title = encodeURIComponent(request.params.title);
		let reqString = 'https://www.omdbapi.com/?t=' + title + '/' + year;
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

