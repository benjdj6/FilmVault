#Author Ben Johnston, github: benjdj6
#Original: 05/05/16
#Current: 05/15/16

CREATE TABLE users (
	username	text PRIMARY KEY,
	password	text
);

CREATE TABLE tokens (
	token 		text PRIMARY KEY,
	username	text REFERENCES users (username)
);

CREATE TABLE film_lists (
	username	text REFERENCES users (username),
	list_name	text,
	imdb_ID		text REFERENCES films(imdb_ID),
	CONSTRAINT list_id PRIMARY KEY(username,list_name)
);

CREATE TABLE films (
	title		text,
	year		smallint,
	imdb_ID		text,
	plot		text
);
