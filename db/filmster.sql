CREATE TABLE users (
	username	text PRIMARY KEY,
	email		text,
	t_created 	timestamp default current_timestamp 
);

CREATE TABLE tokens (
	token_hash 	text,
	username	text REFERENCES users (username)
);

CREATE TABLE film_lists (
	username	text REFERENCES users (username),
	list_name	text,
	imdb_ID		text,
	CONSTRAINT list_id PRIMARY KEY(username,list_name)
);