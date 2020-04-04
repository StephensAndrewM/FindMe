// Setup basic express server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var validate = require('jsonschema').validate;
var forcedomain = require('forcedomain');

var port = process.env.PORT || 3000;
server.listen(port, function () {
	console.log('Server listening at port %d', port);
});

// Don't allow access to site at herokuapp.com URL
app.use(forcedomain({
  hostname: 'lets.playfind.me'
}));

// Allow access to static components
app.use(express.static(__dirname + '/public'));
app.use("/bower_components/", express.static(__dirname+"/bower_components"));

// Constants
var TileState = {
	UNPRESSED: 0,
	PRESSED: 1,
	WINNING: 2
};

var PRESS_TIMEOUT = 10;
var GAME_SPACER_TIMEOUT = 5;

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
	CanStartNewGame: true,
	Players: [],
	Board: [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
	CurrentId: -1,
	WinningTile: null,
	WinsByUsername: {},
}

// These things stay on the server
var PrivateServerState = {
	WinningTile: { x: -1, y: -1 },
	PressTimeout: null,
	GameSpacerTimeout: null,
}

io.on(ClientMessages.CONNECTION, function (client) {

	// Initially we don't know who this client is
	client.username = null;

	// Greet the user with people who are already present, and whether a game is in progress
	sendToClient(client, ServerMessages.CONNECT_RESULT, {
		state: GlobalGameState
	})

	client.on(ClientMessages.JOIN, function(data) {
		logIncoming(client, ClientMessages.JOIN);

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

		if (GlobalGameState.Players.indexOf(sanitizedName) !== -1) {
			console.log("join: Player name already registered");
			sendToClient(client, ServerMessages.JOIN_RESULT, {
				success: false,
				message: 'That name is already taken!',
				state: GlobalGameState
			});

		} else if (GlobalGameState.GameInProgress) {
			console.log("join: Game in progress")
			sendToClient(client, ServerMessages.JOIN_RESULT, {
				success: false,
				message: 'Wait until this game ends to join!',
				state: GlobalGameState
			});

		// If good name, put into appropriate players list and respond happily
		} else {
			GlobalGameState.Players.push(sanitizedName);
			
			// Tell the client they connected successfully
			sendToClient(client, ServerMessages.JOIN_RESULT, {
				success: true,
				name: sanitizedName,
				state: GlobalGameState
			});

			// Associate this string with the client so we know who disconnected
			client.username = sanitizedName;
			console.log("Client " + client.id + " assigned username " + sanitizedName);

			// Tell everyone to update their players list
			sendToAllClients(ServerMessages.PLAYER_LIST_UPDATE);
		}

	})

	client.on(ClientMessages.START, function(data) {
		logIncoming(client, ClientMessages.START);

		// Data is empty, no need to check schema

		// Make sure we haven't already started a game
		if (GlobalGameState.GameInProgress) { 
			console.log("start: Game already in progress");
			return;
		}
		if (!GlobalGameState.CanStartNewGame) {
			console.log("start: Game creation disabled");
			return;
		}

		initializeGame();

		// Notify all players, including player that pressed the start button
		sendToAllClients(ServerMessages.GAME_START);
		// Add a bonus 3 seconds since the players can't interact with the game then
		expectPress(PRESS_TIMEOUT + 3);

	})

	client.on(ClientMessages.PRESS, function(data) {
		logIncoming(client, ClientMessages.PRESS);

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
		if (client.username != GlobalGameState.Players[GlobalGameState.CurrentId]) {
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

			// Record a win for the user in the in-memory scoreboard
			if (!(client.username in GlobalGameState.WinsByUsername)) {
				GlobalGameState.WinsByUsername[client.username] = 0;
			}
			GlobalGameState.WinsByUsername[client.username]++;

			// Don't allow another game to start for a few seconds
			// to allow player UIs to catch up (and also for moderation).
			GlobalGameState.CanStartNewGame = false;
			PrivateServerState.GameSpacerTimeout = setTimeout(function() {
				GlobalGameState.CanStartNewGame = true;
				sendToAllClients(ServerMessages.PLAYER_LIST_UPDATE)
			}, GAME_SPACER_TIMEOUT * 1000)

			// Inform all players, then reset the server state
			sendToAllClients(ServerMessages.VICTORY);

			// Clear the game state and push to clients
			resetGameState();
			sendToAllClients(ServerMessages.PLAYER_LIST_UPDATE)

		// Else, send the updated grid and player info
		} else {

			GlobalGameState.Board[data.y][data.x] = TileState.PRESSED;

			incrementPlayer();
			sendToAllClients(ServerMessages.TILE_PRESS);

			expectPress(PRESS_TIMEOUT);
		}

	})

	client.on(ClientMessages.EXIT, function(data) {
		logIncoming(client, ClientMessages.EXIT);
		gameExitHandler(client);
	});

	client.on(ClientMessages.DISCONNECT, function(data) {
		logIncoming(client, ClientMessages.DISCONNECT);
		gameExitHandler(client);
	})

});

// Socket.io helper methods
var sendToClient = function(client, messageType, data) {
	console.log("Sending " + messageType + " to Client " + client.id + " with Data:");
	console.log(JSON.stringify(data, null, 2));
	client.emit(messageType, data);
}

var sendToAllClients = function(messageType, data) {
	if (data === undefined) {
		data = {};
	}
	// Alway pass along global state
	data.state = GlobalGameState
	console.log("Sending " + messageType + " to All Clients with Data:");
	console.log(JSON.stringify(data, null, 2));
	io.emit(messageType, data);
}

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
	clearTimeout(PrivateServerState.PressTimeout);
}

var incrementPlayer = function() {
	GlobalGameState.CurrentId = (GlobalGameState.CurrentId + 1) % GlobalGameState.Players.length;
}

var expectPress = function(seconds) {
	clearTimeout(PrivateServerState.PressTimeout);
	var timeStamp = Math.floor(Date.now() / 1000);
	console.log("Setting timeout at " + timeStamp);

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
		sendToAllClients(ServerMessages.GAME_RESET, {
			message: username + " Took Too Long!",
		});

	}, seconds * 1000);
}

var gameExitHandler = function(client) {
	// If client never joined, we don't need to do anything
	if (client.username == null) {
		return;
	}

	// Save this since it will be unset momentarily
	var username = client.username;
	
	// Remove the player from list of active players
	var index = GlobalGameState.Players.indexOf(client.username);
	if (index > -1) { 
		GlobalGameState.Players.splice(index, 1);
	}
	client.username = null;

	if (GlobalGameState.GameInProgress) {
		// End game if someone leaves
		resetGameState();
		sendToAllClients(ServerMessages.GAME_RESET, {
			message: username + " Disconnected!",
		});
	} else {
		// Just remove the player from the list
		sendToAllClients(ServerMessages.PLAYER_LIST_UPDATE)
	}
}

var logIncoming = function(client, type) {
	console.log("Received: " + type
		+ " | Name: " + client.username
		+ " | Id:" + client.id);
}