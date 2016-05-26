'use strict';

const Hapi = require('hapi');
const pg = require('pg');

const server = new Hapi.server();
server.connection({port: 8080});

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

server.start((err) => {
	if (err) {
		throw err;
	}
	
	console.log('server running at: ', server.info.uri);
});

