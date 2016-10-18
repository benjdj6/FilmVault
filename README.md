How To Use
==========
####Create a user

>curl -H "Content-Type: application/json" -X POST -d '{"username":{$USERNAME},"email":{$EMAIL}}' https://localhost:3000/users

Returns a token associated to user, this token is not recoverable so be sure to keep somewhere safe

####Get a user's film lists

>curl https://localhost:3000/users/{$USERNAME}/lists

Returns a list of list names associated with specified user

####Get films on a user's list

>curl https://localhost:3000/users/{$USERNAME}/lists/{$USERNAME}

Returns a list of imdb_IDs contained on the specified list owned by specified user

####Create a new list

>curl -H "Content-Type: application/json" -X POST -d '{"listname":{$LISTNAME},"imdb_ID":{$IMDB_ID}}' https://localhost:3000/users/{$USERNAME}/lists?token={$TOKEN}

Creates a new list called {$LISTNAME} with first entry as {$IMDB_ID} owned by user {$USERNAME}

####Add a movie to a list

>curl -X PUT https://localhost:3000/users/{$USERNAME}/lists/{$LISTNAME}?imdb_ID={$IMDB_ID}&token={$TOKEN}

Adds movie {$IMDB_ID} to list {$LISTNAME} owned by user {$USERNAME}

####Delete a movie from a list

>curl -X DELETE https://localhost:3000/users/{$USERNAME}/lists/{$LISTNAME}/{$IMDB_ID}?token={$TOKEN}

Deletes movie {$IMDB_ID} from list {$LISTNAME} owned by user {$USERNAME}

####Delete a user's list

>curl -X PUT https://localhost:3000/users/{$USERNAME}/lists/{$LISTNAME}?token={$TOKEN}

Deletes list {$LISTNAME} owned by user {$USERNAME}

####Get movie info

>curl https://localhost:3000/movie/{$TITLE}/{$YEAR?}

Returns imdb information on movie {$TITLE} made in {$YEAR?}. The year is an optional parameter, but if multiple movies exist with the same title you may receive incorrect data if you leave out the year.


Working
=======
Verification of writer/user for *makeList*, *addFilm*, *deleteFilm*, *deleteList*

All endpoints currently working
Not Working
===========
*All Good For Now!*

To Do (1-most severe 5-least severe)
====================================
Rate limit on GET endpoints

Cleanup async

Finish Dependencies and Setup Documentation

Better tests with mocha
Credit
======
This project uses the [OMDb API created by Brian Fritz](http://www.omdbapi.com) licensed under [Creative Commons License 4.0](https://creativecommons.org/licenses/by-nc/4.0/)
This project is not endorsed by or affiliated with OMDb API.
