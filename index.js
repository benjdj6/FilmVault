'use strict';

//TODO: Drop/recreate user table
//Drop token table

const Hapi = require('hapi');
const pg = require('pg');
const request = require('request');
const config = require('./config');
const redis = require('redis');
const crypto = require('crypto');
//put postgres username and pass here

var client = new pg.Client();
var pool = new pg.Pool(config);
//find way to connect to db in separate function and still use handleError

const server = new Hapi.Server();
server.connection({port: 3000});

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
  			console.log(result.rows[0]);
  			if(result.rows[0]) {
  				htoken = genToken();
  			}
  		});
		//put hashed token in redis store and tokens table, email token to address provided
		return htoken;
	});
}

//Create a new user
server.route({
	method: 'POST',
	path: '/user',
	handler: function (request, reply) {
		//TODO JOIN users and tokens and check if payload has duplicate values
		const hash = crypto.createHash('md5');
		var payload = request.payload;
		var htoken;
		var response = "";
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
		  					response = "Username and Email already in use. Please try another!";
		  				}
		  				else if(data.username == payload.username) {
		  					response = "Username already in use. Please try another!";
		  				}
		  				else if(data.email == payload.email) {
		  					response = "Email already in use. Please try another!";
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
		  				response = "Account created, check your email for your token!"
		  			}
		  			console.log(response);
		  			console.log(token);
		  			reply(response);
		  			done();
	  			});
				//put hashed token in redis store, email token to address provided
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
		    	//call `done()` to release the client back to the pool
		    	done();

		    	if(err) {
		      		return console.error('error running query', err);
		    	}
		    	reply(result.rows);
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
		    	//call `done()` to release the client back to the pool
		    	done();

		    	if(err) {
		      		return console.error('error running query', err);
		    	}
		    	reply(result.rows);
			});
		});
	}
});

//Create a new list {newlist}
server.route({
	method: 'POST',
	path: '/lists/{newlist}',
	handler: function (request, reply) {
		//Go to Redis for rate limiting stuff
		const authorization = request.query.token;
		console.log(authorization.length);
		reply("Hello!");
	}
});

//Add film to existing film list
server.route({
	method: 'PUT',
	path: '/lists/{listname}',
	handler: function(request, reply) {
		reply('Confirm addition of film into list');
	}
});

//Generate api token, pass in username and password
//token will be hash, stored in tokens table, using redis
//PROBABLY DELETE
server.route({
	method: 'POST',
	path: '/newtoken',
	handler: function (request, reply) {
		reply('TOKEN HERE');
	}
});

//Given movie title and optionally the year return info from OMDb
//TODO: Cache it(?)
server.route({
	method: 'GET',
	path: '/movie/{title}/{year?}',
	handler: function (req, reply) {
		const year = req.params.year ? encodeURIComponent(req.params.year) : '';
		const title = encodeURIComponent(req.params.title);
		var reqString = 'http://www.omdbapi.com/?t=' + title + '/' + year;
		request(reqString, function (error, response, body) {
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

