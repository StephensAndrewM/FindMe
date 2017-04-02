// Setup basic express server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var validate = require('jsonschema').validate;

var port = process.env.PORT || 3000;
server.listen(port, function () {
	console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(__dirname + '/public'));
app.use("/bower_components/", express.static(__dirname+"/bower_components"));

// Misc important constants
var UNPRESSED_TILE = 0;
var PRESSED_TILE = 1;
var WINNING_TILE = 2;

// Global to hold current game state
var GAME = {
	started: false,
	players: [],
	grid: [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
	current: null,
	currentId: -1,
	mine: { x: -1, y: -1 }
}

// Sockets
io.on('connection', function (socket) {

	// Greet the user with people who are already present, and whether a game is in progress
	socket.emit('connect ACK', {
		started: GAME.started,
		players: GAME.players
	})

	socket.on('join', function(data) {

		// Define data format, check for bad input
		var schema = {
			type: "object",
			properties: {
				name: { type: "string" }
			},
			required: ["name"]
		};
		if (!validate(data, schema)) { return; }

		// Can't join a game already in progress
		if (GAME.started) {
			console.log("join: Game already in progress");
			socket.emit('join ACK', { success:false, message: 'A game is already in progress. Please wait until it has completed to join.' });

		// Ensure no duplicate usernames
		} else if (GAME.players.indexOf(data.name) !== -1) {
			console.log("join: Player name already registered");
			socket.emit('join ACK', { success:false, message: 'This player has already joined the game. Please enter a different name.' });

		// If good name, put into players list and respond happily
		} else {
			GAME.players.push(data.name);
			socket.emit('join ACK', { success:true, name:data.name });
			socket.username = data.name

			// Tell everyone to update their players list
			io.emit('join', {players: GAME.players});
		}

	})

	socket.on('start', function(data) {

		// Data is empty, no need to check schema

		// Make sure we haven't already started a game
		if (GAME.started) { 
			console.log("start: Game already in progress");
			return;
		}

		// Notify all players, including player that pressed the start button
		initializeGame();
		io.emit('start', {
			current: GAME.current,
			grid: GAME.grid
		});

	})

	socket.on('press', function(data) {

		// Define data format, check for bad input
		var schema = {
			type: "object",
			properties: {
				player: { type: "string" },
				x: { type: "int" },
				y: { type: "int" }
			},
			required: ["player", "x", "y"]
		};
		if (!validate(data, schema)) { 
			console.log("press: Invalid data format");
			return;
		}

		if (!GAME.started){
			console.log("press: No game in progress");
			return;
		}

		// Lots more validation
		if (data.player != GAME.current) {
			console.log("press: Received player data out of turn");
			return;
		}
		if (data.x < 0 || data.x > 3 || data.y < 0 || data.y > 3) {
			console.log("press: Received invalid board location");
			return;
		}
		if (GAME.grid[data.y][data.x] != 0) {
			console.log("press: Attempting to press previously selected tile");
			return;
		}

		// Safe tile, update grid
		GAME.grid[data.y][data.x] = 1;

		// If found the mine, broadcast message to end game
		if (data.y == GAME.mine.y && data.x == GAME.mine.x) {
			// Highlight tile as winning one
			GAME.grid[data.y][data.x] = 2;
			io.emit('victory', {
				grid: GAME.grid,
				winner: data.player
			});
			// Reset for next game
			GAME.started = false;
			GAME.players = [];
			GAME.current = null;

		// Else, send the updated grid and player info
		} else {
			nextPlayer();
			io.emit('press', {
				grid: GAME.grid,
				current: GAME.current
			});
		}

	})

	socket.on('disconnect', function(data) {

		// Remove from users list
		var index = GAME.players.indexOf(socket.username);

		io.emit('disconnect', { 
			lostPlayer: socket.username
			players: GAME.players
		});

		if (GAME.started) {
			// Reset for next game, but preserve players list
			GAME.started = false;
			GAME.players = [];
			GAME.current = null;
		} else {
			// Just remove the player from the list
			if (index > -1) { GAME.players.splice(index, 1); }
		}
		
	})

});

var initializeGame = function() {

	GAME.started = true;
	GAME.grid = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
	GAME.current = GAME.players[0];
	GAME.currentId = 0;

	// Spoilers, this is the algorithm I use
	GAME.mine.x = Math.floor(Math.random()*4);
	GAME.mine.y = Math.floor(Math.random()*4);

}

var resetForNextGame = function() {

	GAME.started = false;
	GAME.players = [];
	GAME.current = null;

}

var nextPlayer = function() {

	GAME.currentId = (GAME.currentId + 1) % GAME.players.length;
	GAME.current = GAME.players[GAME.currentId];

}