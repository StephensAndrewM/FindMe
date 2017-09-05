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

// Constants
var TileState = {
	UNPRESSED: 0,
	PRESSED: 1,
	WINNING: 2
};

var STANDARD_TIMEOUT = 10;

var ClientMessages = {
	JOIN: "join",
	START: "start",
	PRESS: "press",
	EXIT: "exit",
	CONNECTION: "connection",
	DISCONNECT: "disconnect"
};

var ServerMessages = {
	CONNECT_RESULT: "ConnectResult",
	JOIN_RESULT : "JoinResult",
	PLAYER_LIST_UPDATE: "PlayerListUpdate",
	GAME_START: "GameStart",
	TILE_PRESS: "TilePress",
	VICTORY: "Victory",
	GAME_RESET: "GameReset"
};

// State shared between client and server
var GlobalGameState = {
	GameInProgress: false,
	Players: [],
	Board: [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
	CurrentId: -1,
	WinningTile: null,
}

// These things stay on the server
var PrivateServerState = {
	WinningTile: { x: -1, y: -1 },
	PressTimeout: null
}

var MadeTheStupidJokeOnce = false;

// Sockets
io.on(ClientMessages.CONNECTION, function (socket) {

	// Initially we don't know who this client is
	socket.username = null;

	// Greet the user with people who are already present, and whether a game is in progress
	console.log("Emitting: " + ServerMessages.CONNECT_RESULT);
	socket.emit(ServerMessages.CONNECT_RESULT, {
		state: GlobalGameState
	})

	socket.on(ClientMessages.JOIN, function(data) {
		console.log("Received: " + ClientMessages.JOIN);

		// Define data format, check for bad input
		var schema = {
			type: "object",
			properties: {
				name: { type: "string" }
			},
			required: ["name"]
		};
		if (!validate(data, schema)) { return; }

		var sanitizedName = data.name.substring(0,20).toUpperCase();

		// Can't join a game already in progress
		if (GlobalGameState.GameInProgress) {
			console.log("join: Game already in progress");
			console.log("Sending: " + ServerMessages.JOIN_RESULT);
			socket.emit(ServerMessages.JOIN_RESULT, { 
				success: false, 
				message: 'A game is already in progress!',
				state: GlobalGameState
			});

		// Ensure no duplicate usernames
		} else if (GlobalGameState.Players.indexOf(sanitizedName) !== -1) {
			console.log("join: Player name already registered");
			console.log("Sending: " + ServerMessages.JOIN_RESULT);
			socket.emit(ServerMessages.JOIN_RESULT, {
				success: false,
				message: 'That name is already taken!',
				state: GlobalGameState
			});

		// If good name, put into players list and respond happily
		} else {

			var StupidJokeMessage = 
				(!MadeTheStupidJokeOnce && sanitizedName == "GIA") ? "NO GIA BAD NUMBER!" : "";
			MadeTheStupidJokeOnce = true;

			GlobalGameState.Players.push(sanitizedName);
			console.log("Sending: " + ServerMessages.JOIN_RESULT);
			socket.emit(ServerMessages.JOIN_RESULT, {
				success: true,
				name: sanitizedName,
				message: StupidJokeMessage,
				state: GlobalGameState
			});
			// Associate this string with the socket so we know who disconnected
			socket.username = sanitizedName

			// Tell everyone to update their players list
			console.log("Sending: " + ServerMessages.PLAYER_LIST_UPDATE);
			io.emit(ServerMessages.PLAYER_LIST_UPDATE, {
				state: GlobalGameState
			});
		}

	})

	socket.on(ClientMessages.START, function(data) {
		console.log("Received: " + ClientMessages.START);

		// Data is empty, no need to check schema

		// Make sure we haven't already started a game
		if (GlobalGameState.GameInProgress) { 
			console.log("start: Game already in progress");
			return;
		}

		initializeGame();

		// Notify all players, including player that pressed the start button
		console.log("Sending: " + ServerMessages.GAME_START);
		io.emit(ServerMessages.GAME_START, {
			state: GlobalGameState
		});
		expectPress(STANDARD_TIMEOUT + 3);

	})

	socket.on(ClientMessages.PRESS, function(data) {
		console.log("Received: " + ClientMessages.PRESS);

		// Define data format, check for bad input
		var schema = {
			type: "object",
			properties: {
				x: { type: "int" },
				y: { type: "int" }
			},
			required: ["playerName", "x", "y"]
		};
		if (!validate(data, schema)) { 
			console.log("press: Invalid data format");
			return;
		}

		if (!GlobalGameState.GameInProgress) { 
			console.log("press: No game in progress");
			return;
		}

		// Lots more validation
		if (socket.username != GlobalGameState.Players[GlobalGameState.CurrentId]) {
			console.log("press: Received player data out of turn");
			return;
		}
		if (data.x < 0 || data.x > 3 || data.y < 0 || data.y > 3) {
			console.log("press: Received invalid board location");
			return;
		}
		if (GlobalGameState.Board[data.y][data.x] != TileState.UNPRESSED) {
			console.log("press: Attempting to press previously selected tile");
			return;
		}

		// If found the winning tile, broadcast message to end game
		if (data.y == PrivateServerState.WinningTile.y && data.x == PrivateServerState.WinningTile.x) {

			// Highlight tile as winning one
			GlobalGameState.Board[data.y][data.x] = TileState.WINNING;

			// Copy the winning tile to server state so clients can display
			GlobalGameState.WinningTile = PrivateServerState.WinningTile;

			// Inform all players, then reset the server state
			console.log("Sending: " + ServerMessages.VICTORY);
			io.emit(ServerMessages.VICTORY, {
				state: GlobalGameState
			});
			resetGameState();
			// Clear the client-side game state
			console.log("Sending: " + ServerMessages.PLAYER_LIST_UPDATE);
			io.emit(ServerMessages.PLAYER_LIST_UPDATE, {
				state: GlobalGameState
			})

		// Else, send the updated grid and player info
		} else {

			GlobalGameState.Board[data.y][data.x] = TileState.PRESSED;

			incrementPlayer();
			console.log("Sending: " + ServerMessages.TILE_PRESS);
			io.emit(ServerMessages.TILE_PRESS, {
				state: GlobalGameState
			});

			expectPress(STANDARD_TIMEOUT);
		}

	})

	socket.on(ClientMessages.EXIT, function(data) {
		gameExitHandler(socket);
	});

	socket.on(ClientMessages.DISCONNECT, function(data) {
		gameExitHandler(socket);
	})

});

var initializeGame = function() {
	GlobalGameState.GameInProgress = true;
	GlobalGameState.Board = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];

	// Pick a random player to start
	GlobalGameState.CurrentId = Math.floor(Math.random() * GlobalGameState.Players.length);

	// Pick a spot on the board for the winning tile
	PrivateServerState.WinningTile.x = Math.floor(Math.random()*4);
	PrivateServerState.WinningTile.y = Math.floor(Math.random()*4);
	// FOR DEBUG ONLY winning tile is deterministic
	// PrivateServerState.WinningTile.x = 0;
	// PrivateServerState.WinningTile.y = 0;

}

var resetGameState = function() {
	GlobalGameState.GameInProgress = false;
	GlobalGameState.CurrentId = null;
}

var incrementPlayer = function() {
	GlobalGameState.CurrentId = (GlobalGameState.CurrentId + 1) % GlobalGameState.Players.length;
}

var expectPress = function(seconds) {

	clearTimeout(PrivateServerState.PressTimeout);
	var timeStamp = Math.floor(Date.now() / 1000);
	console.log("Setting timeout at " + timeStamp);

	console.log(seconds * 1000);

	PrivateServerState.PressTimeout = setTimeout(function() {

		var timeStamp = Math.floor(Date.now() / 1000);
		console.log("Timeout has occurred at " + timeStamp);

		// Don't do anything if the game is over
		if (!GlobalGameState.GameInProgress) {
			return;
		}

		var username = GlobalGameState.Players[GlobalGameState.CurrentId];

		// Notify players and restart game
		resetGameState();
		console.log("Sending: " + ServerMessages.GAME_RESET);
		io.emit(ServerMessages.GAME_RESET, {
			message: username + " Took Too Long!",
			state: GlobalGameState
		});

	}, seconds * 1000);
}

var gameExitHandler = function(socket) {
	console.log("Received: " + ClientMessages.DISCONNECT);

	// If client never joined, we don't need to do anything
	if (socket.username == null) {
		return;
	}

	// Find the user in the players list
	var index = GlobalGameState.Players.indexOf(socket.username);
	if (index > -1) { GlobalGameState.Players.splice(index, 1); }

	if (GlobalGameState.GameInProgress) {
		// Restart the game if someone leaves
		resetGameState();
		console.log("Sending: " + ServerMessages.GAME_RESET);
		io.emit(ServerMessages.GAME_RESET, {
			message: socket.username + " Disconnected!",
			state: GlobalGameState
		});
	} else {
		// Just remove the player from the list
		console.log("Sending: " + ServerMessages.PLAYER_LIST_UPDATE);
		io.emit(ServerMessages.PLAYER_LIST_UPDATE, {
			state: GlobalGameState
		})
	}
}