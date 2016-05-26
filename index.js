'use strict';

const Hapi = require('hapi');
const pg = require('pg');
const request = require('request');

//put postgres username and pass here

const server = new Hapi.Server();
server.connection({port: 3000});

//Create a new user
server.route({
	method: 'POST',
	path: '/user',
	handler: function (request, reply) {
		reply('Confirm creation or say if user already exists');
	}
});

//return user's film lists
server.route({
	method: 'GET',
	path: '/lists',
	handler: function (request, reply) {
		reply('User\'s list names');
	}
});

//return films on user's film list {listname}
server.route({
	method: 'GET',
	path: '/lists/{listname}',
	handler: function (request, reply) {
		reply('Films on provided list');
	}
});

//return films on {username}'s film list {listname}
server.route({
	method: 'GET',
	path: '/lists/{listname}/{username}',
	handler: function (request, reply) {
		reply('Films on specified list');
	}
});

//Create a new list {newlist}
server.route({
	method: 'POST',
	path: '/lists/{newlist}',
	handler: function (request, reply) {
		reply('Confirm creation of or pre-existence of list');
	}
});

//Generate api token, pass in username and password
//token will be hash, stored in tokens table
server.route({
	method: 'POST',
	path: '/newtoken',
	handler: function (request, reply) {
		reply('TOKEN HERE');
	}
});

//Given movie title and optionally the year return info from OMDb
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

server.start((err) => {

    if (err) {
        throw err;
    }
    console.log('Server running at:', server.info.uri);
});

